import EventedMixin from "./eventedmixin.js";
export { GenericInput, TouchInput, MouseInput };

class GenericInput {
  constructor(options = {}) {
    this.options = options;
    console.assert(this.options.node, "Input needs an options.node");
    let doc = this.options.node.ownerDocument;
    doc.addEventListener("visibilitychange", this);
    if (!doc.hidden) {
      this.start();
    }
    doc.defaultView.addEventListener("resize", this);
  }
  handleEvent(event) {
    let doc = this.options.node.ownerDocument;
    if (event.type == "visibilitychange") {
      switch (doc.visibilityState) {
        case "visible":
          this.start();
          break;
        case "hidden":
          this.pause();
          break;
      }
    }
    if (event.type == "resize") {
      requestAnimationFrame(() => {
        this.updateSize();
      });
    }
  }
  preparePointFromEvent(event, pointObject={}) {
    normalizeEventCoords(event, this.nodeOffsets, pointObject);
    if (event.identifier) {
      pointObject.id = event.identifier;
    }
    return pointObject;
  }
  updateSize() {
    this.nodeOffsets = this.options.node.getBoundingClientRect();
  }
}

function clamp(val, lbound, ubound) {
  return Math.min(Math.max(val, lbound), ubound);
}

function normalizeEventCoords(evt, rect, coords={}) {
  let {width, height, top, left} = rect;
  let x = clamp(evt.pageX - left, 0, width) / width;
  let y = clamp(evt.pageY - top, 0, height) / height;
  // scale coordinates to range from -11 to 11
  coords.x = -11 + x * 22;
  coords.y = -11 + y * 22;
  return coords;
}

class TouchInput extends EventedMixin(GenericInput) {
  constructor(options = {}) {
    super(options);
    console.log("TouchInput.constructor, watching visibilitychange");
  }
  start() {
    console.log("TouchInput.start, watching touchmove");
    let target = this.options.node;
    target.addEventListener("touchstart", this);
    target.addEventListener("touchend", this);
    target.addEventListener("touchcancel", this);
    target.addEventListener("touchmove", this);
    this.updateSize();
    this._touches = [];
  }
  pause() {
    console.log("TouchInput.pause, unwatching touchmove");
    let target = this.options.node;
    target.removeEventListener("touchstart", this);
    target.removeEventListener("touchend", this);
    target.removeEventListener("touchcancel", this);
    target.removeEventListener("touchmove", this);
  }

  handleEvent(event) {
    super.handleEvent(event);

    switch (event.type) {
      case "touchstart":
        event.preventDefault();
        let touches = Array.from(event.changedTouches).map(touch => {
          let point = {
            id: touch.identifier
          };
          this.preparePointFromEvent(touch, point);
          return point;
        });
        this._touches.push(...touches);
        break;
      case "touchend":
      case "touchcancel":
        event.preventDefault();
        for (let touch of event.changedTouches) {
          let idx = this._touches.findIndex(t => t.id == touch.identifier);
          if (idx >= 0) {
            this._touches.splice(idx, 1);
          }
        }
        break;
      case "touchmove":
        event.preventDefault();
        for (let touch of event.changedTouches) {
          let idx = this._touches.findIndex(t => t.id == touch.identifier);
          if (idx >= 0) {
            this.preparePointFromEvent(touch, this._touches[idx]);
          } else {
            console.warn("Unexpected touch: ", touch);
          }
        }
        let evt = {
          data: this._touches.slice()
        };
        this.emit("touchmove", evt);
        break;
    }
  }
}

class MouseInput extends EventedMixin(GenericInput) {
  constructor(options = {}) {
    super(options);
    console.log("MouseInput.constructor, watching visibilitychange");
  }
  start() {
    console.log("MouseInput.start, watching mousemove");
    let target = this.options.node;
    target.addEventListener("mousedown", this);
    target.addEventListener("mouseup", this);
    target.addEventListener("mousemove", this);
    this.updateSize();
  }
  pause() {
    console.log("MouseInput.pause, unwatching mousemove");
    let target = this.options.node;
    target.removeEventListener("mousedown", this);
    target.removeEventListener("mouseup", this);
    target.removeEventListener("mousemove", this);
  }
  handleEvent(event) {
    super.handleEvent(event);
    switch (event.type) {
      case "mousedown":
        this._mousedown = true;
        break;
      case "mouseup":
        this._mousedown = false;
        break;
      case "mousemove":
        if (this._mousedown) {
          let point = {};
          this.preparePointFromEvent(event, point);
          let evt = {
            data: [point]
          };
          this.emit("mousemove", evt);
        }
        break;
    }
  }
}
