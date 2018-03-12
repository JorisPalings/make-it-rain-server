const ws = require('ws');
const turf = require('@turf/turf');

const config = {
  port: process.env.PORT || 6969,
  maxFOV: 45, // degrees
  maxDistance: 1000 // km
}

const server = new ws.Server({
  port: config.port,
  clientTracking: true
}, () => {
  console.log(`WebSocket server listening on port ${config.port}`);
});

const clients = [
  { id: 'Noorden',  latitude: 51.859528,  longitude: 4.645805 },
  { id: 'Oosten',   latitude: 50.859528,  longitude: 5.645805 },
  { id: 'Zuiden',   latitude: 49.859528,  longitude: 4.645805 },
  { id: 'Westen',   latitude: 50.859528,  longitude: 3.645805 }
];

console.log('All clients:', clients);

server.on('connection', (socket, request) => {
  const clientIP = request.connection.remoteAddress;

  socket.on('message', message => {
    const parsedMessage = JSON.parse(message);

    switch(parsedMessage.type) {
      case 'handshake':
        handleHandshakeMessage(socket, clientIP);
        break;

      case 'position':
        handlePositionMessage(clientIP, parsedMessage).then(clientsInFOV => {
          server.clients.forEach(client => {
            if (client.readyState === ws.OPEN) {
              client.send(JSON.stringify({ type: 'clients', data: clientsInFOV }));
            }
          });
        }).catch(error => {
          console.error(error);
        });
        break;

      case 'heading':
        handleHeadingMessage(clientIP, parsedMessage).then(clientsInFOV => {
          server.clients.forEach(client => {
            if (client.readyState === ws.OPEN) {
              client.send(JSON.stringify({ type: 'clients', data: clientsInFOV }));
            }
          });
        }).catch(error => {
          console.error(error);
        });
        break;

      case 'payment':
        handlePaymentMessage(clientIP, parsedMessage).then((recipient) => {
          const recipientSocket = getClientById(recipient).socket;
          recipientSocket.send(JSON.stringify({ type: 'receivedPayment', data: sender.id }));
        }).catch(error => {
          console.error(error);
        });
        break;

      default:
        break;
    }
    console.log('----------------------------------------');
  });

  socket.on('close', (event) => {
    console.log(`Client ${clientIP} disconnected`);
    removeClientById(clientIP);
  });

  socket.on('error', (event) => {
    console.error(`Client ${clientIP} disconnected`);
    removeClientById(clientIP);
  });
});

function handleHandshakeMessage(socket, clientIP) {
  console.log(`Received handshake from ${clientIP}`);
  clients.push({
    id: clientIP,
    socket: socket
  });
  console.log(`Client ${clientIP} connected`);
}

function handlePositionMessage(clientIP, message) {
  return new Promise((resolve, reject) => {
    try {
      const currentClient = getClientById(clientIP);
      currentClient.latitude = message.data.latitude;
      currentClient.longitude = message.data.longitude;
      console.log(`Position of client ${currentClient.id} changed to ${message.data.latitude}, ${message.data.longitude}`);
      if(currentClient.heading) {
        findClientsInFOV(currentClient).then(clientsInFOV => {
          resolve(clientsInFOV);
        }).catch(error => {
          reject(error);
        });
      }
    } catch (error) {
      reject('Error', error);
    }
  });
}

function handleHeadingMessage(clientIP, message) {
  return new Promise((resolve, reject) => {
    try {
      const currentClient = getClientById(clientIP);
      currentClient.heading = message.data;
      console.log(`Heading of client ${currentClient.id} changed to ${message.data}`);
      if(currentClient.latitude && currentClient.longitude) {
        findClientsInFOV(currentClient).then(clientsInFOV => {
          resolve(clientsInFOV)
        }).catch(error => {
          reject(error);
        });
      }
    } catch (error) {
      reject('Error', error);
    }
  });
}

function handlePaymentMessage(clientIP, message) {
  return new Promise((resolve, reject) => {
    try {
      const recipient = message.data;
      console.log('Received payment from', clientIP, 'for', recipient);
      resolve(recipient);
    } catch(error) {
      reject(error);
    }
  });
}

function getClientById(id) {
  return clients.find(client => client.id === id);
}

function removeClientById(id) {
  clients.splice(clients.indexOf(getClientById(id)), 1);
}

function findClientsInFOV(currentClient) {
  return new Promise((resolve, reject) => {
    try {
      console.log('All clients:', clients);
      const allOtherClients = clients.filter(client => client !== currentClient);
      const clientsInFOV = [];
      allOtherClients.forEach(possibleClient => {
        if(isClientInFOV(currentClient, possibleClient)) {
          console.log(possibleClient.id, 'is in FOV');
          clientsInFOV.push(possibleClient);
        }
      });
      resolve(clientsInFOV);
    } catch(error) {
      reject('Error: Error trying to find clients in FOV: ' + error);
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
  // console.log('Lower bound is', lowerBound, 'and upper bound is', upperBound);
  return turf.booleanContains(sector, otherClientPosition);
}