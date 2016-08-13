// julia.js - 2016.08.13 - Atlee Brink

// scaling (zoom) stuff
var scaleRPow2 = 1;
var scaleRPow2Min = -4;
var scaleRPow2Max = 48;
var scaleRPow2Step = 0.01;
var scaleRPow2RatePerPixel = 0.2;
var scaleRPow2Slider = document.getElementById('scaleRPow2');
var scaleRPow2ValueChanged = false;

function initScaleRPow2Slider() {
  scaleRPow2Slider.min = scaleRPow2Min;
  scaleRPow2Slider.max = scaleRPow2Max;
  scaleRPow2Slider.step = scaleRPow2Step;
  scaleRPow2ValueChanged = true;
  updateScaleRPow2Slider();
}

function updateScaleRPow2Slider() {
  if( scaleRPow2ValueChanged ) {
    scaleRPow2Slider.value = scaleRPow2;        
    scaleRPow2ValueChanged = false;
  }
}

// iterations stuff
var maxIts = 20;
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

// fractal parameters
var C = {r: 0.0, i: 0.0}; // complex constant for some fractals
var CrBig = 0, CrSmall = 0;
var CiBig = 0, CiSmall = 0;
function setC() { C = {r: CrBig + CrSmall, i: CiBig + CiSmall}; }

// viewport parameters
var Z = {r: 0.0, i: 0.0}; // complex coordinates of current center
var Zchanged = true;

function updateUIZCoords() {
  if( Zchanged ) {
    var rLog10 = 1 / Math.log( 10 );
    var numDigits = Math.log( Math.pow( 2, scaleRPow2 + 12 ) ) * rLog10;
    infoZCoordsR.innerHTML = (Z.r >= 0 ? "+" : "-") + Math.abs( Z.r.toFixed(numDigits) );
    infoZCoordsI.innerHTML = (Z.i >= 0 ? "+" : "-") + Math.abs( Z.i.toFixed(numDigits) );
    Zchanged = false;
  }
}

var rotate = 0; // radians; 0.0 corresponds with x = real, y = imaginary; counter-clockwise

// UI output
// note: it seems necessary to throttle text element updates,
//       else Safari in particular spends all its time updating the text
//       instead of doing anything else.
var updateUITimeLast = 0;
var updateUIMinInterval = 500;
var needsUIUpdated = false;

function updateUI( force ) {
  var timeNow = performance.now();
  if( force || ((timeNow - updateUITimeLast) * 0.001 >= updateUIMinInterval) ) {
    // update controls
    updateScaleRPow2Slider();

    // update texts
    updateUIZCoords();
    updateMaxIts();

    updateUITimeLast = timeNow;
    needsUIUpdated = false;
  } else {
    needsUIUpdated = true;
  }
}

// control handlers
function setMaxIts( value ) {
  var newMaxIts = Number(value);
  if( newMaxIts != maxIts ) { maxIts = newMaxIts; maxItsChanged = true; fractalRenderAsync(); updateUI(); }
}
function setRotate( value ) {
  var newRotate = Math.PI * Number(value) / -180.0;
  if( newRotate != rotate ) { rotate = newRotate; fractalRenderAsync(); }
}
function setCrBig( value ) {
  var newCrBig = Number(value);
  if( newCrBig != CrBig ) { CrBig = newCrBig; setC(); fractalRenderAsync(); updateUI(); }
}
function setCrSmall( value ) {
  var newCrSmall = Number(value);
  if( newCrSmall != CrSmall ) { CrSmall = newCrSmall; setC(); fractalRenderAsync(); updateUI(); }
}
function setCiBig( value ) {
  var newCiBig = Number(value);
  if( newCiBig != CiBig ) { CiBig = newCiBig; setC(); fractalRenderAsync(); updateUI(); }
}
function setCiSmall( value ) {
  var newCiSmall = Number(value);
  if( newCiSmall != CiSmall ) { CiSmall = newCiSmall; setC(); fractalRenderAsync(); updateUI(); }
}
function setScaleRPow2( value ) {
  var newScaleRPow2 = Number(value);
  if( newScaleRPow2 != scaleRPow2 ) { scaleRPow2 = newScaleRPow2; fractalRenderAsync(); updateUI(); }
}

// initialization, AFTER global variables are assigned
(function initializeEverything() {

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
  initScaleRPow2Slider();
  initMaxItsSlider();
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
    updateUI();
  }

  function redraw() {
    fractalRenderAsync();
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
    drawBuffer = offscreenContext.createImageData( canvas.width, canvas.height );

    redraw();
  }
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
  if( typeof(Worker) !== undefined ) {
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
    var newScaleRPow2 = Math.max( scaleRPow2Min, Math.min( scaleRPow2Max, scaleRPow2 + delta * scaleRPow2RatePerPixel ) );
    if( newScaleRPow2 != scaleRPow2 ) {

      // this part is complicated:

      // compute an updated value of 'step', which is the complex : pixel ratio
      computeZDeltas();

      // convert cursor coordinates to complex coordinates, which uses 'step'
      var cursorZ = xy_to_ri( x, y );

      // compute change (delta) from current complex coordinates to cursor complex coordinates
      var dZr = Z.r - cursorZ.r;
      var dZi = Z.i - cursorZ.i;

      // compute the new / old scale with power math (keep reciprocals in mind)
      var newScaleRatio = Math.pow( 2, scaleRPow2 - newScaleRPow2 );

      // finally, shift new center complex coordinate toward cursor appropriately
      Z = { r: cursorZ.r + dZr * newScaleRatio, i: cursorZ.i + dZi * newScaleRatio };
      Zchanged = true;

      // assign new scale
      scaleRPow2 = newScaleRPow2;
      scaleRPow2ValueChanged = true;

      fractalRenderAsync();

      updateUI( false );
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

  step = Math.pow( 2, -scaleRPow2 ) * 4.0 / Math.min(cw, ch);

  var cos = Math.cos(rotate);
  var sin = Math.sin(rotate);

  dZrx = step * cos;
  dZix = -step * sin;
  dZry = -step * sin;
  dZiy = -step * cos;
}

function xy_to_ri( x, y ) {
  var x0 = (x + canvas.width / -2) * step;
  var y0 = (-y + canvas.height / 2) * step;

  var ncos = Math.cos(-rotate);
  var nsin = Math.sin(-rotate);

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
        fnInColor: 'smooth',
        fnOutColor: 'smooth'
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
