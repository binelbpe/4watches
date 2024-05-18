const nocache = require("nocache");

// Define a middleware function to configure nocache
const nocacheMiddleware = () => {
  return nocache({
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
};

module.exports = nocacheMiddleware;
