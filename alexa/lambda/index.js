// Alexa-Skill "Einkauf"
//   "Alexa, öffne Einkauf und schreibe Brot auf die Liste"
//   "Alexa, sag Einkauf, ich brauche Milch und Eier"
//   "Alexa, frag Einkauf, was auf der Liste steht"
const Alexa = require('ask-sdk-core');
const config = require('./config');
const { ShoppingList, joinGerman } = require('./shopping');

const list = new ShoppingList(config);
const REPROMPT = 'Noch etwas?';

const LaunchRequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  handle: (h) => h.responseBuilder
    .speak('Was soll auf die Einkaufsliste?')
    .reprompt('Sag zum Beispiel: schreibe Brot auf die Liste.')
    .getResponse(),
};

const AddItemIntentHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AddItemIntent',
  async handle(h) {
    const text = Alexa.getSlotValue(h.requestEnvelope, 'item');
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
    .speak('Das habe ich nicht verstanden. Sag zum Beispiel: schreibe Brot auf die Liste.')
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
