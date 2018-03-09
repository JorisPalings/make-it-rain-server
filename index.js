const config = {
  port: 6969,
  maxFOV: 45, // degrees
  maxDistance: 1000 // km
}

const ws = require('ws');
const turf = require('@turf/turf');
const express = require('express');
const webSocketServer = require('ws').Server;

const app = express()
  .listen(config.port, () => {
    console.info(`Listening on port ${config.port}`);
  });

app.get('/', (req, res) => {
  res.send('Hello world!');
});

const server = new webSocketServer({ server: app });

const clients = [
  { id: 'Noorden',  latitude: 51.859528,  longitude: 4.645805 },
  { id: 'Oosten',   latitude: 50.859528,  longitude: 5.645805 },
  { id: 'Zuiden',   latitude: 49.859528,  longitude: 4.645805 },
  { id: 'Westen',   latitude: 50.859528,  longitude: 3.645805 }
];

server.on('connection', (socket, request) => {
  const clientIP = request.connection.remoteAddress;
  console.info(`Established connection with ${clientIP}`);

  socket.on('message', message => {
    console.log('----------------------------------------');
    const parsedMessage = JSON.parse(message);
    switch(parsedMessage.type) {
      case 'handshake':
        handleHandshakeMessage(clientIP, parsedMessage);
        break;
      case 'position':
        handlePositionMessage(clientIP, parsedMessage);
        break;
      case 'heading':
        handleHeadingMessage(clientIP, parsedMessage);
        break;
      case 'payment':
        handlePaymentMessage(clientIP, parsedMessage);
        break;
      default:
        break;
    }
    console.log('----------------------------------------');
  });

  socket.on('close', (event) => {
    console.error(`Closed connection with ${clientIP}`);
    removeClientById(clientIP);
  });

  socket.on('error', (event) => {
    console.error(`Closed connection with ${clientIP}`);
    removeClientById(clientIP);
  });
});

function handleHandshakeMessage(clientIP, message) {
  console.info(`Received handshake from client with id ${clientIP}`);
  clients.push({
    id: clientIP
  });
  console.info(`Added client with id ${clientIP}`);
}

function handlePositionMessage(clientIP, message) {
  try {
    let currentClient = getClientById(clientIP);
    currentClient.latitude = message.data.latitude;
    currentClient.longitude = message.data.longitude;
    console.info(`Position of client ${currentClient.id} changed to ${message.data.latitude}, ${message.data.longitude}`);
    if(currentClient.heading) findClientsInFOV(clientIP);
  } catch (error) {
    console.error('Error', clientIP);
  }
}

function handleHeadingMessage(clientIP, message) {
  try {
    let currentClient = getClientById(clientIP);
    currentClient.heading = message.data;
    console.info(`Heading of client ${currentClient.id} changed to ${message.data}`);
    if(currentClient.latitude && currentClient.longitude) findClientsInFOV(clientIP);
  } catch (error) {
    console.error('Error:', error);
  }
}

function handlePaymentMessage(clientIP, message) {
  console.info(`Payment made by client ${clientIP} with position ${getClientById(clientIP).latitude}, ${getClientById(clientIP).longitude} and heading ${getClientById(clientIP).heading}`);
}

function getClientById(id) {
  return clients.find(client => client.id === id);
}

function removeClientById(id) {
  clients.splice(clients.indexOf(getClientById(id)), 1);
  console.info(`Removed client ${id}`);
}

function findClientsInFOV(clientIP) {
  const currentClient = getClientById(clientIP);
  console.log(clients);
  const allOtherClients = clients.filter(client => client !== currentClient);
  console.log(allOtherClients);
  const possibleClients = [];
  allOtherClients.forEach(possibleClient => {
    if(isClientInFOV(currentClient, possibleClient)) {
      console.info(possibleClient.id, 'is in FOV');
      possibleClients.push(possibleClient);
    }
  });
}

function isClientInFOV(currentClient, otherClient) {
  const halfFOV = config.maxFOV / 2;
  const currentClientPosition = turf.point([currentClient.longitude, currentClient.latitude]);
  const otherClientPosition = turf.point([otherClient.longitude, otherClient.latitude]);
  const lowerBound = (currentClient.heading - halfFOV) >= 0 ? (currentClient.heading - halfFOV) : 360 - (currentClient.heading - halfFOV);
  const upperBound = (currentClient.heading + halfFOV) < 360 ? (currentClient.heading + halfFOV) : (currentClient.heading + halfFOV) % 360;
  const sector = turf.sector(currentClientPosition, config.maxDistance, lowerBound, upperBound);
  console.info('Lower bound is', lowerBound, 'and upper bound is', upperBound);
  return turf.booleanContains(sector, otherClientPosition);
}