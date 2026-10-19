// Alexa-Skill "Einkauf"
//   "Alexa, sag Einkauf, ich brauche Brot"
//   "Alexa, sag Einkauf, ich brauche Milch und Eier"
//   "Alexa, frag Einkauf, was auf der Liste steht"
const Alexa = require('ask-sdk-core');
const config = require('./config');
const { ShoppingList, joinGerman } = require('./shopping');

// Erst beim ersten Zugriff anlegen: Ein Fehler (z. B. in config.js) landet dann im
// ErrorHandler und Alexa sagt etwas, statt dass der Skill schon beim Laden abstürzt.
let listInstance;
const list = {
  add: (text) => (listInstance = listInstance || new ShoppingList(config)).add(text),
  openItems: () => (listInstance = listInstance || new ShoppingList(config)).openItems(),
};
const REPROMPT = 'Noch etwas?';

const LaunchRequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  handle: (h) => h.responseBuilder
    .speak('Was soll auf die Einkaufsliste?')
    .reprompt('Sag zum Beispiel: Brot und Milch.')
    .getResponse(),
};

const AddItemIntentHandler = {
  // ItemOnlyIntent: nur der Artikel ("Brot"), z. B. als Antwort auf "Was soll auf die Einkaufsliste?"
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && ['AddItemIntent', 'ItemOnlyIntent'].includes(Alexa.getIntentName(h.requestEnvelope)),
  async handle(h) {
    const text = Alexa.getIntentName(h.requestEnvelope) === 'ItemOnlyIntent'
      ? Alexa.getSlotValue(h.requestEnvelope, 'food')
      : Alexa.getSlotValue(h.requestEnvelope, 'item');
    if (!text) {
      return h.responseBuilder.speak('Was soll ich aufschreiben?').reprompt('Was soll auf die Liste?').getResponse();
    }
    const { added, existing } = await list.add(text);
    const parts = [];
    if (added.length) parts.push(`${joinGerman(added)} ${added.length === 1 ? 'steht' : 'stehen'} jetzt auf der Liste.`);
    if (existing.length) parts.push(`${joinGerman(existing)} ${existing.length === 1 ? 'stand' : 'standen'} schon drauf.`);
    if (!parts.length) parts.push('Das habe ich nicht verstanden.');
    // Bei "öffne Einkauf und …" endet die Sitzung nach einer Antwort; im Dialog fragen wir nach.
    const isOneShot = h.requestEnvelope.session && h.requestEnvelope.session.new;
    const rb = h.responseBuilder.speak(parts.join(' ') + (isOneShot ? '' : ` ${REPROMPT}`));
    return isOneShot ? rb.withShouldEndSession(true).getResponse() : rb.reprompt(REPROMPT).getResponse();
  },
};

const ReadListIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'ReadListIntent',
  async handle(h) {
    const items = await list.openItems();
    const speech = items.length === 0
      ? 'Die Einkaufsliste ist leer.'
      : `Auf der Liste ${items.length === 1 ? 'steht' : 'stehen'}: ${joinGerman(items.map((i) => (i.quantity ? `${i.quantity} ${i.name}` : i.name)))}.`;
    return h.responseBuilder.speak(speech).withShouldEndSession(true).getResponse();
  },
};

const HelpIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent',
  handle: (h) => h.responseBuilder
    .speak('Sag zum Beispiel: schreibe Brot und Milch auf die Liste. Oder frag: was steht auf der Liste?')
    .reprompt('Was soll auf die Liste?')
    .getResponse(),
};

const StopHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && ['AMAZON.StopIntent', 'AMAZON.CancelIntent', 'AMAZON.NoIntent', 'AMAZON.NavigateHomeIntent']
      .includes(Alexa.getIntentName(h.requestEnvelope)),
  handle: (h) => h.responseBuilder.speak('Alles klar.').withShouldEndSession(true).getResponse(),
};

const FallbackIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent',
  handle: (h) => h.responseBuilder
    .speak('Das habe ich nicht verstanden. Sag zum Beispiel: ich brauche Brot.')
    .reprompt('Was soll auf die Liste?')
    .getResponse(),
};

const SessionEndedRequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
  handle: (h) => h.responseBuilder.getResponse(),
};

const ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error('Fehler:', error);
    return h.responseBuilder
      .speak('Die Einkaufsliste ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.')
      .withShouldEndSession(true)
      .getResponse();
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AddItemIntentHandler,
    ReadListIntentHandler,
    HelpIntentHandler,
    StopHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
