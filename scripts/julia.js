// julia.js - 2016.08.13 to 2016.08.21 - Atlee Brink
// TODO: convert to ECMAScript 6 when the time is right
// TODO: finish casting unneeded semicolons back to Hell

var InitialValues = {
  C: {r: 0.0, i: 0.0},
  insideColor: 'rgb(255,255,250)',
  insideShading: FractalWorker.insideShadingDefault, // fractalworker.js
  maxIts: 1,
  outsideColor: 'orange',
  outsideShading: FractalWorker.outsideShadingDefault, // fractalworker.js
  rotation: 0,
  scaleRPow2: -3.2,
  textColor: 'white',
  Z: {r: 7, i: -8}
}

var InteractionLimits = {
  CBig: {min: -1.99, max: 1.99, step: 0.01},
  CSmall: {min: -0.01, max: 0.01, step: 0.00001},
  maxIts: {min: 1, max: 250, step: 1},
  rotation: {min: -190, max: 190, step: 0.1},
  scaleRPow2: {min: -4, max: 48, step: 0.01, ratePerPixel: 0.2}
}

////////////////////////////////////////
// interaction variables
////////////////////////////////////////
var C, CrBig, CrSmall, CiBig, CiSmall
var insideColor, insideShading
var maxIts
var outsideColor, outsideShading
var panStartCursor, panStartZ
var scaleRPow2
var textColor
var Z

////////////////////////////////////////
// rendering variables
////////////////////////////////////////
var canvas = document.getElementById('canvas');
var offscreenCanvas;
var drawBuffer;
var canvasChunksX = 4, canvasChunksY = 4; // more chunks means smaller chunks means more balanced load
var pendingDisplay = false;
var lastDisplayTime = 0;
var minDisplayIntervalSeconds = 1 / 61;

// Web Workers
var numWorkers = 12; // what is the max? what happens if we make too many?
var workers = null;
var pendingTasks = null;
var numPendingTasks = 0;
var futureRender = false;
var frameID = 0; // increment by 1 before issuing a frame; wrap back to 0 at some point (arbitrary)

// progressive rendering (note: this is slow on Safari in particular)
var progChunks = {x: 1, y: 1};
var progCoords = {x: 0, y: 0};
var progComplete = 0;

// cache
var dZrx = 0.0, dZix = 0.0;
var dZry = 0.0, dZiy = 0.0;
var step;

////////////////////////////////////////
// experimental
////////////////////////////////////////
// todo: move somewhere more appropriate maybe
function onPicture() {
  alert("this feature isn't fully implemented yet!")

  // todo: ask user for render dimensions
  var width = 500, height = 400
  // todo: generate a filename that says something about the fractal
  var filename = 'fractal-picture-from-atleebrink.com.png'

  // prepare render canvas
  var backgroundCanvas = document.createElement('canvas')
  backgroundCanvas.width = width
  backgroundCanvas.height = height

  var backgroundContext = backgroundCanvas.getContext('2d')
  backgroundContext.fillStyle = outsideColor
  backgroundContext.fillRect(0, 0, width, height)

  // todo: put into a non-display render mode somehow, and resize all the buffers (can resize them back afterward)
  // todo: render fractal as normal (will go into high-res draw buffer)
  // todo: either use a different worker callback, or use a task flag or something,
  //       so that the output is not displayed on the normal canvas, but instead is just drawn into
  //       the draw buffer
  // todo: when done rendering, needs to finish the process and trigger the file save
  var pictureCanvas = backgroundCanvas

  var picture = pictureCanvas.toDataURL('image/png').replace('data:image/png', 'data:application/octet-stream')
  var anchor = document.createElement('a')
  anchor.download = filename // note: this should work on Safari soon, but doesn't work at this moment
  anchor.href = picture
  anchor.click()

  //window.location.href = anchor
  /*
  var imageWindow = window.open( pictureCanvas.toDataURL('image/png'), '_blank')
  if( imageWindow ) imageWindow.focus()
  else {
    alert("A picture was rendered, but your browser isn't allowing the PNG to be displayed.")
  }
  */
  
  // todo: set back into display render-mode
}

function onShare() {
  // todo: implement
  alert("not yet implemented!")
}

////////////////////////////////////////
// "Object" Constructors
////////////////////////////////////////

function ColorInput( domInputId, initial, fnOnChange ) {
  var me = this

  this.value = initial
  this.doChange = function() { fnOnChange( this.value ) }
  this.get = function() { return this.value }

  this.el = document.getElementById( domInputId )
  this.el.value = this.value
  this.el.onblur = function() { set( this.value ) }
  this.el.onkeydown = function() { if( event.keyCode === 13 ) set( this.value ) }

  function set( newValue ) { if( newValue != me.value ) { me.value = newValue; me.doChange() } }
}

function ShadingSelector( domSelectorId, functionsObject, initial, fnOnChange ) {
  var me = this

  this.value = initial
  this.doChange = function() { fnOnChange( this.value ) }
  this.get = function() { return this.value }

  this.el = document.getElementById( domSelectorId )
  this.el.onchange = function() { set( this.value ) }
  
  for( var shadingName in functionsObject ) {
    var option = document.createElement('option')
    option.text = shadingName
    option.selected = shadingName == initial
    this.el.add( option )
  }

  function set( newValue ) { me.value = newValue; me.doChange() }
}

function Slider( domSliderId, initial, min, max, step, fnOnChange, fnShow ) {
  var me = this

  this.value = initial
  this.min = min
  this.max = max
  this.changed = true
  this.doChange = function() { fnOnChange( this.value ) }
  this.show = function() { if( this.changed ) { fnShow(); this.changed = false } }

  this.slider = document.getElementById( domSliderId )
  this.slider.min = min
  this.slider.max = max
  this.slider.step = step
  this.slider.value = initial
  this.slider.oninput = function() { me.set( Number(this.value) ) }
  this.slider.onchange = function() { me.set( Number(this.value) ) }

  this.set = function( newValue ) { if( newValue !== me.value ) { me.changed = true; me.value = newValue; me.doChange() } }
}

////////////////////////////////////////
// Initializers
////////////////////////////////////////

function initC() {
  var infoCr = document.getElementById('infoCr')
  var infoCi = document.getElementById('infoCi')
  var onchange = function() { setC(); fractalRenderAsync(); updateUI(false) }
  var showCr = function() { if( C.rChanged ) { infoCr.innerHTML = (C.r >= 0 ? "+" : "-") + Math.abs(C.r).toFixed(5); C.rChanged = false } }
  var showCi = function() { if( C.iChanged ) { infoCi.innerHTML = (C.i >= 0 ? "+" : "-") + Math.abs(C.i).toFixed(5); C.iChanged = false } }
  var blim = InteractionLimits.CBig
  var slim = InteractionLimits.CSmall
  var crbig = Math.min( blim.max, Math.max( blim.min, Math.trunc( InitialValues.C.r / blim.step ) * blim.step ) )
  var crsmall = InitialValues.C.r - crbig
  var cibig = Math.min( blim.max, Math.max( blim.min, Math.trunc( InitialValues.C.i / blim.step ) * blim.step ) )
  var cismall = InitialValues.C.i - cibig

  CrBig = new Slider( 'CrBig', crbig, blim.min, blim.max, blim.step, onchange, showCr )
  CrSmall = new Slider( 'CrSmall', crsmall, slim.min, slim.max, slim.step, onchange, showCr )
  CiBig = new Slider( 'CiBig', cibig, blim.min, blim.max, blim.step, onchange, showCi )
  CiSmall = new Slider( 'CiSmall', cismall, slim.min, slim.max, slim.step, onchange, showCi )
  C = {r: InitialValues.C.r, i: InitialValues.C.i}
  C.rChanged = true
  C.iChanged = true

  function setC() {
    var Cr = CrBig.value + CrSmall.value
    var Ci = CiBig.value + CiSmall.value
    C.rChanged = Cr != C.r
    if( C.rChanged ) C.r = Cr
    if( C.iChanged = Ci != C.i ) C.i = Ci
  }
}

function initMaxIts() {
  var info = document.getElementById('infoMaxIts')
  var onchange = function() { fractalRenderAsync(); updateUI(false) }
  var show = function() { info.innerHTML = maxIts.value.toFixed() }
  var lim = InteractionLimits.maxIts
  maxIts = new Slider( 'maxIts', InitialValues.maxIts, lim.min, lim.max, lim.step, onchange, show )
}

function initRotation() {
  var info = document.getElementById('infoRotation')
  var onchange = function() { fractalRenderAsync(); updateUI(false) }
  var show = function() { info.innerHTML = (-rotation.value).toFixed(1); }
  var lim = InteractionLimits.rotation
  rotation = new Slider( 'rotation', InitialValues.rotation, lim.min, lim.max, lim.step, onchange, show )
  rotation.toRadians = function() { return Math.PI * rotation.value / -180.0 }
}

function initScaleRPow2() {
  var info = document.getElementById('infoScale')
  var onchange = function() { fractalRenderAsync(); updateUI(false) }
  var show = function() { scaleRPow2.slider.value = scaleRPow2.value; info.innerHTML = Math.pow(2, scaleRPow2.value).toExponential(1) }
  var lim = InteractionLimits.scaleRPow2
  scaleRPow2 = new Slider( 'scaleRPow2', InitialValues.scaleRPow2, lim.min, lim.max, lim.step, onchange, show )
  scaleRPow2.ratePerPixel = lim.ratePerPixel
}

function initZ() {
  var infoZr = document.getElementById('infoZr')
  var infoZi = document.getElementById('infoZi')
  Z = {r: InitialValues.Z.r, i: InitialValues.Z.i}
  Z.changed = true
  Z.set = function( r, i ) {
    if( r !== Z.r ) { Z.r = r; Z.changed = true }
    if( i !== Z.i ) { Z.i = i; Z.changed = true }
  }
  Z.show = function() {
    const rLog10 = 1 / Math.log( 10 )
    if( Z.changed ) {
      var numDigits = Math.log( Math.pow( 2, scaleRPow2.value + 12 ) ) * rLog10
      infoZr.innerHTML = (Z.r >= 0 ? "+" : "-") + Math.abs( Z.r ).toFixed(numDigits)
      infoZi.innerHTML = (Z.i >= 0 ? "+" : "-") + Math.abs( Z.i ).toFixed(numDigits)
      Z.changed = false
    }
  }
}

// TODO: tidy up UI update stuff, maybe into an object
// UI output
// note: it seems necessary to throttle text element updates,
//       else Safari in particular spends all its time updating the text
//       instead of doing anything else.
var updateUITimeLast = 0;
var updateUIMinInterval = 1 / 30;
var needsUIUpdated = false;

function updateUI( force ) {
  var timeNow = performance.now()
  if( force || ((timeNow - updateUITimeLast) * 0.001 >= updateUIMinInterval) ) {
    // show controls and text if they've changed
    CrBig.show()
    CrSmall.show()
    CiBig.show()
    CiSmall.show()
    maxIts.show()
    rotation.show()
    scaleRPow2.show()
    Z.show()
    //updateUIZCoords()

    updateUITimeLast = timeNow;
    needsUIUpdated = false;
  } else {
    needsUIUpdated = true;
  }
}

// initialization, AFTER global variables are assigned
(function initializeEverything() {
  
  // todo: check if WebWorkers are supported:
  //   if not supported:
  //     can't do multithreading, and this will probably be too slow without it,
  //     so maybe show a friendly message to that effect.
  //   if supported:
  //     continue with initialization

  // TODO: try to get initial values from URI string: ...?insideColor=red&outsideColor=blue&...
  // TODO: validate initial values; use defaults otherwise

  // initialize variables, but don't do any rendering yet
  initC()
  insideColor = new ColorInput( 'insideColor', InitialValues.insideColor, function( value ) { initDrawBuffer( value ); fractalRenderAsync() } )
  insideShading = new ShadingSelector( 'insideShading', FractalWorker.insideShadingFunctions, InitialValues.insideShading, function( value ) { fractalRenderAsync() } )
  initMaxIts()
  outsideColor = new ColorInput( 'outsideColor', InitialValues.outsideColor, function( value ) { document.getElementById('body').style['background-color'] = value; } )
  outsideShading = new ShadingSelector( 'outsideShading', FractalWorker.outsideShadingFunctions, InitialValues.outsideShading, function( value ) { fractalRenderAsync() } )
  initRotation()
  initScaleRPow2()
  textColor = InitialValues.textColor
  initZ();

  // visually prepare the body so there's something to look at while initializing other stuff
  var body = document.getElementById('body')
  body.style['color'] = textColor
  outsideColor.doChange()

  // multithreading
  initWorkers()

  // canvas, including the first render
  // TODO: try to avoid rendering until the insideColor has been initialized
  initCanvasResizeMechanism()

  insideColor.doChange() // TODO: combine this's render into initCanvasResizeMechanism ONLY during initialization
  initPanZoom();

  // show the controls
  document.getElementById('controls').style.display = 'flex'
})()

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

function initPanZoom() {
  // thanks to: http://phrogz.net/tmp/canvas_zoom_to_cursor.html
  canvas.addEventListener( 'mousedown', mouseDown, false );
  canvas.addEventListener( 'mousemove', mouseMove, false );
  canvas.addEventListener( 'mouseup', mouseUp, false );
  canvas.addEventListener( 'DOMMouseScroll', handleScroll, false );
  canvas.addEventListener( 'mousewheel', handleScroll, false );
}

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

    Z.set( panStartZ.r - dr, panStartZ.i - di )

    fractalRenderAsync()

    updateUI(false)
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
      Z.set( cursorZ.r + dZr * newScaleRatio, cursorZ.i + dZi * newScaleRatio );
      //Z = { r: cursorZ.r + dZr * newScaleRatio, i: cursorZ.i + dZi * newScaleRatio };
      //Zchanged = true;

      scaleRPow2.set( newScaleRPow2 );
    }
  }
  return event.preventDefault() && false;
}

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

// TODO: put this and xy_to_ri in an object with their now-global variables for tidiness
function computeZDeltas() {
  var cw = canvas.width;
  var ch = canvas.height;

  step = Math.pow( 2, -scaleRPow2.value ) * 4.0 / Math.min(cw, ch);

  var radians = rotation.toRadians();
  var cos = Math.cos(radians);
  var sin = Math.sin(radians);

  dZrx = step * cos;
  dZix = -step * sin;
  dZry = -step * sin;
  dZiy = -step * cos;
}

function xy_to_ri( x, y ) {
  var x0 = (x + canvas.width / -2) * step;
  var y0 = (-y + canvas.height / 2) * step;

  var radians = -rotation.toRadians()
  var ncos = Math.cos(radians)
  var nsin = Math.sin(radians)

  return {r: x0 * ncos - y0 * nsin + Z.r, i: x0 * nsin + y0 * ncos + Z.i};
}

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
        paramC: {r: C.r, i: C.i},
        paramMaxIts: maxIts.value,
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

  function roundUpBy( num, multiple ) {
    return num % multiple == 0 ? num : (Math.floor( num / multiple ) + 1) *  multiple;
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

// END
