// julia.js - 2016.08.13 to 2016.08.20 - Atlee Brink
// TODO: convert to ECMAScript 6 when the time is right

var InitialValues = {
  outsideColor: 'orange',
  insideColor: 'rgb(255,255,250)',
  textColor: 'white',
  outsideShading: FractalWorker.outsideShadingDefault, // fractalworker.js
  insideShading: FractalWorker.insideShadingDefault, // fractalworker.js
  scaleRPow2: -3.2
}

var InteractionLimits = {
  scaleRPow2: {min: -4, max: 48, step: 0.01}
}

// TODO: put all global variables here
var outsideColor;
var insideColor;
var textColor;
var outsideShading;
var insideShading;
var scaleRPow2;

// todo: move somewhere more appropriate maybe
function onPicture() {
  alert("this feature isn't fully implemented yet!");

  // todo: ask user for render dimensions
  var width = 500, height = 400;
  // todo: generate a filename that says something about the fractal
  var filename = 'fractal-picture-from-atleebrink.com.png';

  // prepare render canvas
  var backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.width = width;
  backgroundCanvas.height = height;

  var backgroundContext = backgroundCanvas.getContext('2d');
  backgroundContext.fillStyle = outsideColor;
  backgroundContext.fillRect(0, 0, width, height);

  // todo: put into a non-display render mode somehow, and resize all the buffers (can resize them back afterward)
  // todo: render fractal as normal (will go into high-res draw buffer)
  // todo: either use a different worker callback, or use a task flag or something,
  //       so that the output is not displayed on the normal canvas, but instead is just drawn into
  //       the draw buffer
  // todo: when done rendering, needs to finish the process and trigger the file save
  var pictureCanvas = backgroundCanvas;

  var picture = pictureCanvas.toDataURL('image/png').replace('data:image/png', 'data:application/octet-stream');
  var anchor = document.createElement('a');
  anchor.download = filename; // note: this should work on Safari soon, but doesn't work at this moment
  anchor.href = picture;
  anchor.click();

  //window.location.href = anchor;
  /*
  var imageWindow = window.open( pictureCanvas.toDataURL('image/png'), '_blank');
  if( imageWindow ) imageWindow.focus();
  else {
    alert("A picture was rendered, but your browser isn't allowing the PNG to be displayed.");
  }
  */
  
  // todo: set back into display render-mode
}

function onShare() {
  // todo: implement
  alert("not yet implemented!");
}

// "Object" Constructors
function ColorInput( domInputId, initial, onchange ) {
  var me = this;

  this.value = initial;
  this.onchange = onchange;
  this.dochange = function() { onchange( this.value ); };
  this.get = function() { return this.value; };

  this.el = document.getElementById( domInputId );
  this.el.value = this.value;
  this.el.onblur = function() { set( this.value ); };
  this.el.onkeydown = function() { if( event.keyCode === 13 ) set( this.value ); };

  function set( newValue ) { if( newValue !== me.value ) { me.value = newValue; me.dochange(); } }
}

function ShadingSelector( domSelectorId, functionsObject, initial, onchange ) {
  var me = this;

  this.value = initial;
  this.dochange = function() { onchange( this.value ); };
  this.get = function() { return this.value; };

  this.el = document.getElementById( domSelectorId );
  this.el.onchange = function() { set( this.value ); };
  
  for( var shadingName in functionsObject ) {
    var option = document.createElement('option');
    option.text = shadingName;
    option.selected = shadingName == initial;
    this.el.add( option );
  }

  function set( newValue ) { me.value = newValue; me.dochange(); }
}

function Slider( domSliderId, initial, min, max, step, onchange, fnshow ) {
  var me = this

  this.value = initial
  this.min = min
  this.max = max
  this.changed = true
  this.dochange = function() { onchange( this.value ) }
  this.show = function() { if( this.changed ) { fnshow(this); this.changed = false; } }

  this.slider = document.getElementById( domSliderId );
  this.slider.min = min;
  this.slider.max = max;
  this.slider.step = step;
  this.slider.value = initial;
  this.slider.oninput = function() { me.set( Number(this.value) ); }
  this.slider.onchange = function() { me.set( Number(this.value) ); }

  this.set = function( newValue ) { if( newValue !== me.value ) { me.changed = true; me.value = newValue; me.dochange(); } }
}

function initScaleRPow2() {
  var onchange = function() { fractalRenderAsync(); updateUI(false); }
  var show = function(self) { self.slider.value = self.value; self.info.innerHTML = Math.pow(2, self.value).toExponential(1); }
  scaleRPow2 = new Slider( 'scaleRPow2', -3.2, -4, 48, 0.01, onchange, show );
  scaleRPow2.ratePerPixel = 0.2;
  scaleRPow2.info = document.getElementById('infoScale');
}

// iterations stuff
var maxIts = 1;
var maxItsMin = 1;
var maxItsMax = 250;
var maxItsStep = 1;
var maxItsSlider = document.getElementById('maxIts');
var maxItsInfo = document.getElementById('infoMaxIts');
var maxItsChanged = true;

function initMaxItsSlider() {
  maxItsSlider.min = maxItsMin;
  maxItsSlider.max = maxItsMax;
  maxItsSlider.step = maxItsStep;
  maxItsSlider.value = maxIts;
}

function updateMaxIts() {
  if( maxItsChanged ) {
    maxItsInfo.innerHTML = maxIts.toFixed();
    maxItsChanged = false;
  }
}

// rotation stuff
var rotate = 0; // degrees; 0 corresponds with x = real, y = imaginary; counter-clockwise
var rotateRadians = 0; // depends on 'rotate'
var rotateMin = -190;
var rotateMax = 190;
var rotateStep = 0.1;
var rotateSlider = document.getElementById('rotate');
var rotateInfo = document.getElementById('infoRotate');
var rotateChanged = true;

function initRotate() {
  rotateSlider.min = rotateMin;
  rotateSlider.max = rotateMax;
  rotateSlider.step = rotateStep;
  rotateSlider.value = rotate;
}

function updateRotate() {
  if( rotateChanged ) {
    rotateInfo.innerHTML = rotate.toFixed(1);
    rotateChanged = false;
  }
}

// fractal parameters
var C = {r: 0.0, i: 0.0}; // complex constant for some fractals
var CrBig = 0, CrSmall = 0;
var CiBig = 0, CiSmall = 0;
//var CrBigSlider = document.getElementById('CrBig');
var CrInfo = document.getElementById('infoCr');
var CiInfo = document.getElementById('infoCi');
var CrChanged = true;
var CiChanged = true;

function setC() {
  var Cr = CrBig + CrSmall;
  var Ci = CiBig + CiSmall;
  CrChanged = Cr != C.r;
  CiChanged = Ci != C.i;
  if( CrChanged || CiChanged ) C = {r: Cr, i: Ci};
}

function updateC() {
  // note: it is unlikely that Cr and Ci will change together
  if( CrChanged ) {
    CrInfo.innerHTML = (C.r >= 0 ? "+" : "-") + Math.abs(C.r).toFixed(5);
    CrChanged = false;
  }
  if( CiChanged ) {
    CiInfo.innerHTML = (C.i >= 0 ? "+" : "-") + Math.abs(C.i).toFixed(5);
    CiChanged = false;
  }
}

// DOM local variables
//var infoText = document.getElementById('infoText');
var infoZCoords = document.getElementById('infoZCoords');
var canvas = document.getElementById('canvas');

// canvas
var offscreenCanvas;
var drawBuffer;
var canvasChunksX = 4, canvasChunksY = 4; // more chunks means smaller chunks means more balanced load
var pendingDisplay = false;

// Web Workers
var numWorkers = 12; // what is the max? what happens if we make too many?
var workers = null;
var pendingTasks = null;
var numPendingTasks = 0;
var futureRender = false;
var frameID = 0; // increment by 1 before issuing a frame; wrap back to 0 at some point (arbitrary)

// progressive rendering
var progChunks = {x: 1, y: 1};
var progCoords = {x: 0, y: 0};
var progComplete = 0;

// viewport parameters
var Z = {r: 7, i: -8}; // complex coordinates of current center
var Zchanged = true;

function updateUIZCoords() {
  if( Zchanged ) {
    // note: it is very likely that Zr and Zi will change together
    var rLog10 = 1 / Math.log( 10 );
    var numDigits = Math.log( Math.pow( 2, scaleRPow2.value + 12 ) ) * rLog10;
    infoZCoordsR.innerHTML = (Z.r >= 0 ? "+" : "-") + Math.abs( Z.r.toFixed(numDigits) );
    infoZCoordsI.innerHTML = (Z.i >= 0 ? "+" : "-") + Math.abs( Z.i.toFixed(numDigits) );
    Zchanged = false;
  }
}

// UI output
// note: it seems necessary to throttle text element updates,
//       else Safari in particular spends all its time updating the text
//       instead of doing anything else.
var updateUITimeLast = 0;
var updateUIMinInterval = 1 / 30;
var needsUIUpdated = false;

function updateUI( force ) {
  var timeNow = performance.now();
  if( force || ((timeNow - updateUITimeLast) * 0.001 >= updateUIMinInterval) ) {
    // update controls
    scaleRPow2.show();

    // update texts
    updateUIZCoords();
    updateMaxIts();
    updateRotate();
    updateC();

    updateUITimeLast = timeNow;
    needsUIUpdated = false;
  } else {
    needsUIUpdated = true;
  }
}

// control handlers
function setMaxIts( value ) {
  var newMaxIts = Number(value);
  if( newMaxIts != maxIts ) { maxIts = newMaxIts; maxItsChanged = true; fractalRenderAsync(); updateUI(false); }
}
function setRotate( value ) {
  var newRotate = -Number(value); // actually want the slider to go left -> positive, right -> negative
  rotateChanged = newRotate != rotate;
  if( rotateChanged ) { rotate = newRotate; rotateRadians = Math.PI * rotate / 180.0; fractalRenderAsync(); updateUI(false); }
}
function setCrBig( value ) {
  var newCrBig = Number(value);
  if( newCrBig != CrBig ) { CrBig = newCrBig; setC(); fractalRenderAsync(); updateUI(false); }
}
function setCrSmall( value ) {
  var newCrSmall = Number(value);
  if( newCrSmall != CrSmall ) { CrSmall = newCrSmall; setC(); fractalRenderAsync(); updateUI(false); }
}
function setCiBig( value ) {
  var newCiBig = Number(value);
  if( newCiBig != CiBig ) { CiBig = newCiBig; setC(); fractalRenderAsync(); updateUI(false); }
}
function setCiSmall( value ) {
  var newCiSmall = Number(value);
  if( newCiSmall != CiSmall ) { CiSmall = newCiSmall; setC(); fractalRenderAsync(); updateUI(false); }
}

// initialization, AFTER global variables are assigned
(function initializeEverything() {
  
  // TODO: try to get initial values from URI string: ...?insideColor=red&outsideColor=blue&...
  // TODO: validate initial values; use defaults otherwise

  // initialize variables, but don't do any rendering yet
  outsideColor = new ColorInput( 'outsideColor', InitialValues.outsideColor, function( value ) { document.getElementById('body').style['background-color'] = value; } );
  insideColor = new ColorInput( 'insideColor', InitialValues.insideColor, function( value ) { initDrawBuffer( value ); fractalRenderAsync(); } ); 
  textColor = InitialValues.textColor;
  outsideShading = new ShadingSelector( 'outsideShading', FractalWorker.outsideShadingFunctions, InitialValues.outsideShading, function( value ) { fractalRenderAsync(); } );
  insideShading = new ShadingSelector( 'insideShading', FractalWorker.insideShadingFunctions, InitialValues.insideShading, function( value ) { fractalRenderAsync(); } );
  initScaleRPow2();

  // visually prepare the body so there's something to look at while initializing other stuff
  var body = document.getElementById('body');
  body.style['color'] = textColor;
  outsideColor.dochange();

  // todo: check if WebWorkers are supported:
  //   if not supported:
  //     can't do multithreading, and this will probably be too slow without it,
  //     so maybe show a friendly message to that effect.
  //   if supported:
  //     continue with initialization

  // multithreading
  initWorkers();

  // canvas, including the first render
  initCanvasResizeMechanism();

  // UI
  insideColor.dochange();
  initMaxItsSlider();
  initRotate();
  initPanZoom();

  // show the controls
  document.getElementById('controls').style.display = 'flex';
})();

// canvas-resize mechanism
function initCanvasResizeMechanism() {
  // thanks to: http://htmlcheats.com/html/resize-the-html5-canvas-dyamically/
  initialize();

  function initialize() {
    window.addEventListener('resize', resizeCanvas, false);
    resizeCanvas();
    updateUI(false);
  }

  function resizeCanvas() {
    var context = canvas.getContext('2d');
    var oldImage = context.getImageData( 0, 0, canvas.width, canvas.height );
    var x = Math.floor((window.innerWidth - canvas.width) / 2);
    var y = Math.floor((window.innerHeight - canvas.height) / 2);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    context.putImageData( oldImage, x, y );

    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;
    offscreenContext = offscreenCanvas.getContext('2d');

    initDrawBuffer( insideColor.value );

    fractalRenderAsync();
  }
}

function initDrawBuffer( color ) {
  var w = offscreenCanvas.width, h = offscreenCanvas.height;
  offscreenContext.fillStyle = color;
  offscreenContext.fillRect( 0, 0, w, h );
  drawBuffer = offscreenContext.getImageData( 0, 0, w, h );
}

// prepare pan and zoom handlers
function initPanZoom() {
  // thanks to: http://phrogz.net/tmp/canvas_zoom_to_cursor.html
  canvas.addEventListener( 'mousedown', mouseDown, false );
  canvas.addEventListener( 'mousemove', mouseMove, false );
  canvas.addEventListener( 'mouseup', mouseUp, false );
  canvas.addEventListener( 'DOMMouseScroll', handleScroll, false );
  canvas.addEventListener( 'mousewheel', handleScroll, false );
}

// prepare Web Workers
function initWorkers() {
  if( typeof(Worker) != 'undefined' ) {
    workers = [];
    for( var w = 0; w < numWorkers; w++ ) {
      worker = new Worker('scripts/fractalworker.js');
      worker.onmessage = fractalWorkerOnMessage;
      workers.push(worker);
    }
  }
}

var panStartCursor;
var panStartZ;

function mouseDown( event ) {
  var bodystyle = document.body.style;

  bodystyle.mozUserSelect = 'none';
  bodystyle.webkitUserSelect = 'none';
  bodystyle.userSelect = 'none';

  var x = event.offsetX || (event.pageX - canvas.offsetLeft);
  var y = event.offsetY || (event.pageY - canvas.offsetTop);

  panStartCursor = {x: x, y: y};
  panStartZ = {r: Z.r, i: Z.i};

  event.preventDefault();
}

function mouseMove( event ) {
  if( panStartCursor && panStartZ ) {
    var x = event.offsetX || (event.pageX - canvas.offsetLeft);
    var y = event.offsetY || (event.pageY - canvas.offsetTop);

    var dx = x - panStartCursor.x;
    var dy = y - panStartCursor.y;

    computeZDeltas();

    var dr = dx * dZrx + dy * dZry;
    var di = dx * dZix + dy * dZiy;

    Z = { r: panStartZ.r - dr, i: panStartZ.i - di };
    Zchanged = true;

    fractalRenderAsync();

    updateUI( false );
  }
}

function mouseUp( event ) {
  panStartCursor = null;
  panStartZ = null;
}

function handleScroll( event ) {
  // for getting wheel events, thanks to: http://phrogz.net/tmp/canvas_zoom_to_cursor.html
  var delta = event.wheelDelta ? event.wheelDelta / 40 : event.detail ? -event.detail : 0;
  if( delta ) {

    var x = event.offsetX || (event.pageX - canvas.offsetLeft);
    var y = event.offsetY || (event.pageY - canvas.offsetTop);

    // compute new scale, but only re-render if it's in bounds and has changed 
    //var newScaleRPow2 = Math.max( scaleRPow2Min, Math.min( scaleRPow2Max, scaleRPow2 + delta * scaleRPow2RatePerPixel ) );
    var newScaleRPow2 = Math.max( scaleRPow2.min, Math.min( scaleRPow2.max, scaleRPow2.value + delta * scaleRPow2.ratePerPixel ) );
    if( newScaleRPow2 != scaleRPow2.value ) {

      // this part is complicated:

      // compute an updated value of 'step', which is the complex : pixel ratio
      computeZDeltas();

      // convert cursor coordinates to complex coordinates, which uses 'step'
      var cursorZ = xy_to_ri( x, y );

      // compute change (delta) from current complex coordinates to cursor complex coordinates
      var dZr = Z.r - cursorZ.r;
      var dZi = Z.i - cursorZ.i;

      // compute the new / old scale with power math (keep reciprocals in mind)
      var newScaleRatio = Math.pow( 2, scaleRPow2.value - newScaleRPow2 );

      // finally, shift new center complex coordinate toward cursor appropriately
      Z = { r: cursorZ.r + dZr * newScaleRatio, i: cursorZ.i + dZi * newScaleRatio };
      Zchanged = true;

      scaleRPow2.set( newScaleRPow2 );
    }
  }
  return event.preventDefault() && false;
}

var lastDisplayTime = 0;
var minDisplayIntervalSeconds = 1 / 61;

// onmessage callback from worker(s)
function fractalWorkerOnMessage( event ) {
  var workerOut = event.data;
  var sameFrame = workerOut.task.frameID == frameID;

  if( pendingTasks && pendingTasks.length ) {
    var task = pendingTasks.shift();
    task.workerIndex = workerOut.task.workerIndex;
    workers[task.workerIndex].postMessage( task );
  }

  if( sameFrame ) {
    copyFractalOutputToDrawBuffer( workerOut );
    var pos = workerOut.task.pos;
    var size = workerOut.task.size;
    var stride = workerOut.task.stride;
    offscreenCanvas.getContext('2d').putImageData( drawBuffer, 0, 0, pos.x, pos.y, size.w * stride.x, size.h * stride.y );
  }

  if( !--numPendingTasks ) {
    if( ++progComplete == progChunks.x * progChunks.y ) progComplete = 0;

    if( progComplete || futureRender ) fractalRenderAsync();

    displayFrame( performance.now() );
    // note: it would be nice if we limited calls to displayFrame to avoid
    //       requesting un-seen frames, but Safari 9 in particular is really inconsistent
    //       with both window.requestAnimationFrame and window.setTimeout.
    //       The problem seems to be that the callbacks are called back too late,
    //       creating the appearance of even worse frame rates!
    //       So for now, I'm leaving this feature disabled, and we'll just draw
    //       frames as they're completed without regard for how long it's been.
    // note2: Neither Chrome nor Firefox seem to suffer this problem.
    //var now = performance.now();
    //var diffSeconds = (now - lastDisplayTime) * 0.001;
    //if( diffSeconds >= minDisplayIntervalSeconds ) {
    //  displayFrame( now );
    //} else {
    //  window.setTimeout( function() {
    //    var now = performance.now();
    //    displayFrame( performance.now() );
    //  }, (minDisplayIntervalSeconds - diffSeconds) * 1000 );
    //}
  }
}

function displayFrame( now ) {
  lastDisplayTime = now;

  var context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage( offscreenCanvas, 0, 0 );

  if( needsUIUpdated ) updateUI( true );
}

function copyFractalOutputToDrawBuffer( workerOut ) {
  var inW = workerOut.task.size.w, inH = workerOut.task.size.h;
  var inData = workerOut.array8;

  var outX = workerOut.task.pos.x;
  var outY = workerOut.task.pos.y;
  var outStrideX = workerOut.task.stride.x * 4;
  var outStrideY = (workerOut.task.stride.y * drawBuffer.width - inW * workerOut.task.stride.x) * 4;
  var outData = drawBuffer.data;

  // note: the '+ 3' at the end means we're writing to the alpha channel, which has a channel offset of 3 bytes
  var o = (outY * drawBuffer.width + outX) * 4 + 3;
  var i = 0;
  for( var y = 0; y < inH; ++y, o += outStrideY) {
    for( var x = 0; x < inW; ++x, o += outStrideX, ++i) {
      outData[o] = inData[i];
    }
  }
}

var dZrx = 0.0, dZix = 0.0;
var dZry = 0.0, dZiy = 0.0;
var step;

function computeZDeltas() {
  var cw = canvas.width;
  var ch = canvas.height;

  step = Math.pow( 2, -scaleRPow2.value ) * 4.0 / Math.min(cw, ch);

  var cos = Math.cos(rotateRadians);
  var sin = Math.sin(rotateRadians);

  dZrx = step * cos;
  dZix = -step * sin;
  dZry = -step * sin;
  dZiy = -step * cos;
}

function xy_to_ri( x, y ) {
  var x0 = (x + canvas.width / -2) * step;
  var y0 = (-y + canvas.height / 2) * step;

  var ncos = Math.cos(-rotateRadians);
  var nsin = Math.sin(-rotateRadians);

  return {r: x0 * ncos - y0 * nsin + Z.r, i: x0 * nsin + y0 * ncos + Z.i};
}

// begin drawing the fractal asynchronously
function fractalRenderAsync() {
  if( numPendingTasks ) { // a render is in progress, so don't interrupt it
    futureRender = true;
    return;
  }

  if( futureRender ) {
    // start a new frame
    progComplete = 0;
    frameID++;
    futureRender = false;
  }

  addRenderTasks();
  startRenderTasks();
}

function roundUpBy( num, multiple ) {
  return num % multiple == 0 ? num : (Math.floor( num / multiple ) + 1) *  multiple;
}

function addRenderTasks() {
  // add (canvasChunksX * canvasChunksY) new render tasks,
  // but don't start them yet

  pendingTasks = []; // just in case there was something in there

  computeZDeltas();

  var canvasWidth = canvas.width;
  var canvasHeight = canvas.height;

  var chunkWidth = roundUpBy( Math.floor(canvasWidth / canvasChunksX), progChunks.x );
  var chunkHeight = roundUpBy( Math.floor(canvasHeight / canvasChunksY), progChunks.y );

  var topLeftZ = xy_to_ri( 0, 0 );

  var Zr = topLeftZ.r;
  var Zi = topLeftZ.i;

  for( var y = 0; y < canvasChunksY; ++y ) {
    var height = y < canvasChunksY - 1 ? chunkHeight : canvas.height - y * chunkHeight;
    var chunkPosY = y * chunkHeight + progCoords.y;
    for( var x = 0; x < canvasChunksX; ++x ) {
      var width = x < canvasChunksX - 1 ? chunkWidth : canvas.width - x * chunkWidth;
      var chunkPosX = x * chunkWidth + progCoords.x;

      var task = {
        frameID: frameID,
        pos: {x: chunkPosX, y: chunkPosY},
        stride: {x: progChunks.x, y: progChunks.y},
        size: {w: Math.floor(width / progChunks.x), h: Math.floor(height / progChunks.y)},
        startZ: {
          r: Zr + chunkPosX * dZrx + chunkPosY * dZry,
          i: Zi + chunkPosX * dZix + chunkPosY * dZiy
        },
        stepX: {r: dZrx * progChunks.x, i: dZix * progChunks.x},
        stepY: {r: dZry * progChunks.y, i: dZiy * progChunks.y},
        paramC: C,
        paramMaxIts: maxIts,
        fnInsideShading: insideShading.value,
        fnOutsideShading: outsideShading.value
      };
      pendingTasks.push( task );
    }
  }

  if( ++progCoords.x == progChunks.x ) {
    progCoords.x = 0;
    if( ++progCoords.y == progChunks.y ) progCoords.y = 0;
  }
}

function startRenderTasks() {
  numPendingTasks = pendingTasks.length;
  var wlim = Math.min( workers.length, pendingTasks.length );
  for( var widx = 0; widx < wlim; ++widx ) {
    var task = pendingTasks.shift();
    task.workerIndex = widx;
    workers[widx].postMessage( task );
  }
}
