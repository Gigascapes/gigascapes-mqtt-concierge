module.exports = function(model) {
  return {
    getStatus(req, res) {
      let result = model.get();
      // connect, close, end, message??
      res.send(result);
    }
  };
};
