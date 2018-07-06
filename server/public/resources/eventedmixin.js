// summary:
//    a mixin/trait that provides basic event management capabilities

export default function EventedMixin(superClass) {
  return class Evented extends superClass {
    constructor() {
      super(...arguments);
      this.__events = {};
    }

    // dictionary of all event-names => listener arrays
    on(name, fn) {
      // pubsub thing
      var events = this.__events,
        listeners = events[name] || (events[name] = []);
      listeners.push(fn);
      return {
        type: name,
        remove: function(){
          var idx = listeners.indexOf(fn);
          if(idx >= 0) {
            listeners.splice(idx, 1);
          }
        }
      };
    }

    removeAllListeners(name) {
      // remove all listeners of a particular type
      // pubsub thing
      var coln;
      if (name) {
        // ditch all listeners associated w. that nam
        coln = this.__events[name];
        while (coln && coln.length) {
          coln.pop();
        }
      } else {
        // clear out all listeners
        coln = this.__events;
        for (var i in coln) {
          coln[i] = null;
          delete coln[i];
        }
      }
    }

    emit(name, payload){
      var listeners = this.__events[name] || [];
      payload = payload || {};
      payload.type = name;
      for(var i=0; i<listeners.length; i++){
        listeners[i](payload);
      }
    }
  };
}
