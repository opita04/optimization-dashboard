process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT:', err);
});
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED:', err);
});
require('./server.js');
