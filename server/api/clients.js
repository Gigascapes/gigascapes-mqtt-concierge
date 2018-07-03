// get the list of active clients
// { id: timestamp }
module.exports = function(model) {
  return {
    getClients(req, res) {
      let result = model.getRecent();
      res.json(result);
    },
    getClient(req, res) {
      let clientId = req.params.id;
      let result = model.get(clientId);
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({
          error: `Client "${clientId}" not found.`,
        });
      }
    },
    registerClient(req, res) {
      let clientId = res.locals.id;
      let clientData = {};
      if (!clientId) {
        res.status(500).json({
          error: `Missing required "id" param`,
        });
        return;
      }
      res.json({ message: "TODO: register the client" });
    }
  };
};

