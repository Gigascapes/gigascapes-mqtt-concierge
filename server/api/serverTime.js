module.exports = function(model) {
  let dateProps = [
    "getDate",
    "getDay",
    "getFullYear",
    "getHours",
    "getMilliseconds",
    "getMinutes",
    "getMonth",
    "getSeconds",
    "getTime",
    "getTimezoneOffset",
    "getUTCDate",
    "getUTCDay",
    "getUTCFullYear",
    "getUTCHours",
    "getUTCMilliseconds",
    "getUTCMinutes",
    "getUTCMonth",
    "getUTCSeconds",
    "getYear",
  ];
  return {
    getTime(req, res) {
      model.flush();
      let date = model.date;
      let result = {
        timestamp: model.timestamp,
        utcOffset: model.utcOffset
      };
      for (let name of dateProps) {
        result[name] = date[name]();
      }
      res.send(result);
    }
  };
};
