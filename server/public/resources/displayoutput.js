import cssColors from './cssColors.js';

class DisplayOutput {
  constructor(options={}) {
    this.positions = null;
    this.options = options;
    console.assert(this.options.node, "DisplayOutput needs an options.node for output");
  }
  start() {
    this.running = true;
    this.canvas = this.options.node;
    this.ctx = this.canvas.getContext('2d');
    this.positions = [];
    this.tick();
  }
  stop(){
    this.running = false;
  }
  _convertColorString(color) {
    let r = 0, g = 0, b = 0;
    if (color.charAt(0) == "#") {
      color = color.substring(0);
      if (color.length == 3) {
        r = parseInt(color.substring(0, 1), 16);
        g = parseInt(color.substring(1, 2), 16);
        b = parseInt(color.substring(2, 3), 16);
      } else {
        r = parseInt(color.substring(0, 2), 16);
        g = parseInt(color.substring(2, 4), 16);
        b = parseInt(color.substring(4, 6), 16);
      }
    } else if (color.startsWith('rgb(')) {
      color = color.substring('rgb('.length, color.length -1);
      [r,g,b] = color.split(",");
    } else if (color in cssColors) {
      [r,g,b] = cssColors[color];
    }
    // console.log(`_convertColorString from: ${color} to ${[r,g,b].join(':')}`);
    return [r,g,b, 1];
  }
  _drawDot(posn) {
    let ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(posn.x, posn.y, 10, 0, 2 * Math.PI, false);

    posn.color[3] = posn.opacity;
    ctx.fillStyle = `rgba(${posn.color.join(', ')})`;
    ctx.fill();
  }
  drawDot(coord, color = [0,0,0]) {
    if (!this.running) {
      this.start();
    }
    if (this.paused) {
      this.unpause();
    }
    clearTimeout(this._nextDotTimer);

    if (!Array.isArray(color)) {
      color = this._convertColorString(color);
    }
    // de-normalize coordst count = this
    let posn = {
      x: coord.x * this.canvas.width,
      y: coord.y * this.canvas.height,
      color
    }
    this.positions.unshift(posn);
    this._nextDotTimer = setTimeout(() => {
      this.pause();
    }, 300);
  }
  tick() {
    if (!this.running || this.paused) {
      return;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let count = this.positions.length;
    if (count > 32) {
      count = this.positions.length = 32;
    }
    for (let i = count - 1; i >= 0; i--) {
      let dot = this.positions[i];
      dot.opacity = 1/(i+1);
      this._drawDot(dot);
    }
    requestAnimationFrame(() => this.tick());
  }
  pause() {
    this.paused = false;
  }
  unpause() {
    this.paused = true;
  }
}

export {DisplayOutput as default};
