-- Einkauf – Supabase-Schema
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.
--
-- Zugriffsmodell: Jeder Haushalt hat eine zufällige UUID (den "Haushalts-Code").
-- App und Alexa-Skill schicken ihn im HTTP-Header "x-household-id" mit.
-- Row Level Security lässt nur Zeilen dieses Haushalts durch. Wer den Code
-- nicht kennt, sieht und ändert nichts.

create or replace function public.request_household() returns uuid
language sql stable as $$
  select nullif(nullif(current_setting('request.headers', true), '')::json->>'x-household-id', '')::uuid
$$;

-- Einkaufsliste --------------------------------------------------------------
create table if not exists public.shopping_items (
  id            uuid primary key,
  household_id  uuid not null,
  name          text not null,
  quantity      text not null default '',
  note          text not null default '',
  category      text not null default 'Sonstiges',
  checked       boolean not null default false,
  checked_at    timestamptz,
  source        text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists shopping_items_household on public.shopping_items (household_id);

-- Rezepte ----------------------------------------------------------------------
create table if not exists public.recipes (
  id            uuid primary key,
  household_id  uuid not null,
  title         text not null,
  servings      integer not null default 2,
  ingredients   jsonb not null default '[]'::jsonb,
  instructions  text not null default '',
  source_url    text,
  image_url     text,
  chefkoch_id   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists recipes_household on public.recipes (household_id);

-- Wochenplan -------------------------------------------------------------------
create table if not exists public.meal_plan (
  id            uuid primary key,
  household_id  uuid not null,
  day           date not null,
  recipe_id     uuid references public.recipes(id) on delete set null,
  title         text not null,
  servings      integer not null default 2,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists meal_plan_household on public.meal_plan (household_id, day);

-- Grundvorrat (wird beim Übernehmen von Rezepten nicht auf die Liste gesetzt) ----
create table if not exists public.staples (
  id            uuid primary key,
  household_id  uuid not null,
  name          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists staples_household on public.staples (household_id);

-- Row Level Security -----------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shopping_items', 'recipes', 'meal_plan', 'staples'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists household_access on public.%I', t);
    execute format(
      'create policy household_access on public.%I for all to anon, authenticated
         using (household_id = public.request_household())
         with check (household_id = public.request_household())', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

grant execute on function public.request_household() to anon, authenticated;

-- IDs auch serverseitig erzeugen können (für Kurzbefehle) ------------------------
alter table public.shopping_items alter column id set default gen_random_uuid();
alter table public.recipes        alter column id set default gen_random_uuid();
alter table public.meal_plan      alter column id set default gen_random_uuid();
alter table public.staples        alter column id set default gen_random_uuid();

-- "Brot, Milch, Eier" → "Brot, Milch und Eier"
create or replace function public.join_de(parts text[]) returns text
language sql immutable as $$
  select case
    when coalesce(array_length(parts, 1), 0) <= 1 then coalesce(parts[1], '')
    else array_to_string(parts[1:array_length(parts, 1) - 1], ', ') || ' und ' || parts[array_length(parts, 1)]
  end
$$;

-- Für den Siri-Kurzbefehl: "Brot, 2 Liter Milch und Eier" → drei Einträge -------
-- Aufruf: POST /rest/v1/rpc/add_items  {"items": "...", "src": "Siri"}
create or replace function public.add_items(items text, src text default 'Siri')
returns text
language plpgsql
security invoker
as $$
declare
  hh uuid := public.request_household();
  piece text;
  m text[];
  item_name text;
  qty text;
  existing record;
  added text[] := '{}';
  already text[] := '{}';
begin
  if hh is null then
    return 'Kein Haushalts-Code übergeben.';
  end if;
  foreach piece in array regexp_split_to_array(coalesce(items, ''), '\s*,\s*|\s+und\s+|\s+sowie\s+|\s+plus\s+', 'i') loop
    piece := btrim(regexp_replace(piece, '^(noch|bitte)\s+', '', 'i'));
    continue when piece = '';
    qty := '';
    m := regexp_match(piece, '^(\d+(?:[.,]\d+)?)\s*(kg|g|l|liter|ml|packungen?|päckchen|dosen?|flaschen?|stück|becher|bund|gläser|glas)?\s+(.+)$', 'i');
    if m is not null then
      qty := btrim(m[1] || ' ' || coalesce(m[2], ''));
      piece := m[3];
    end if;
    item_name := upper(left(piece, 1)) || substr(piece, 2);

    select * into existing from public.shopping_items
      where household_id = hh and lower(name) = lower(item_name)
      order by checked asc limit 1;
    if found and not existing.checked then
      already := already || item_name;
      continue;
    elsif found then
      update public.shopping_items
        set checked = false, checked_at = null, quantity = qty, source = src, created_at = now(), updated_at = now()
        where id = existing.id;
    else
      insert into public.shopping_items (household_id, name, quantity, category, source)
        values (hh, item_name, qty, '', src);
    end if;
    added := added || item_name;
  end loop;

  if array_length(added, 1) is null and array_length(already, 1) is null then
    return 'Das habe ich nicht verstanden.';
  end if;
  return btrim(
    case when array_length(added, 1) is null then ''
         else public.join_de(added) || case when array_length(added, 1) = 1 then ' steht' else ' stehen' end || ' auf der Liste. ' end ||
    case when array_length(already, 1) is null then ''
         else public.join_de(already) || case when array_length(already, 1) = 1 then ' stand' else ' standen' end || ' schon drauf.' end);
end $$;

-- Für den Siri-Kurzbefehl "Was steht auf der Liste?"
create or replace function public.list_items()
returns text
language sql
security invoker
stable
as $$
  select case when count(*) = 0 then 'Die Einkaufsliste ist leer.'
    else 'Auf der Liste: ' || public.join_de(array_agg(case when quantity <> '' then quantity || ' ' || name else name end order by created_at)) || '.'
  end
  from public.shopping_items
  where household_id = public.request_household() and not checked
$$;

grant execute on function public.add_items(text, text) to anon, authenticated;
grant execute on function public.list_items() to anon, authenticated;
grant execute on function public.join_de(text[]) to anon, authenticated;
