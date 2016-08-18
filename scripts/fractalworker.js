// fractalworker.js - 2016.08.09 to 2016.08.18 - Atlee Brink
// note: I lovingly crafted these artisanal bespoke codes with my own hands.
//       If you like them, please let me know at: atlee at atleebrink.com

// ( constRThreshold255, lastZr, lastZi, distSquared ) -> Uint8
var insideShadingDefault = 'solid';
var insideShadingFunctions = {
  "solid" : function( constRThreshold255, lastZr, lastZi, distSquared ) { return 255; },
  "smooth" : function( constRThreshold255, lastZr, lastZi, distSquared ) { return Math.sqrt(distSquared) * constRThreshold255; },
  "outside-color" :  function( constRThreshold255, lastZr, lastZi, distSquared ) { return 0; }
};

// ( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) -> Uint8
var outsideShadingDefault = 'smooth';
var outsideShadingFunctions = {
  "solid" : function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return 0; },
  "smooth" : function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return (lastn + constThresholdSquared / Math.sqrt(distSquared)) * constRMaxIts255; },
  "inside-color" : function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return 255; }
};

// Web Worker message catcher
onmessage = function( event ) {
  // note about transferables:
  //   After some experimentation, it seems that neither Firefox, Chrome nor Safari actually implement transferables correctly.
  //   What's supposed to happen: ArrayBuffers should be moved without copy.
  //   What actually happens: ArrayBuffers are copied, memory usage grows rapidly, and the eventual GC interferes with performance.
  //   The fastest alternative seems to be, unfortunately:
  //     allocate a buffer here in the web-worker,
  //     transfer it back to the main thread, where it is eventually garbage-collected.
  //     This is still really slow, but until transferables are properly implemented, this has to do.

  // expects:
  //   event.data = {
  //     size: { w: int, h: int }
  //     startZ: { r: double, i: double }
  //     stepX: { r: double, i: double }
  //     stepY: { r: double, i: double }
  //     paramC: { r: double, i: double }
  //     paramMaxIts: int
  //     fnInsideShading: str (see: insideShadingFunctions above)
  //     fnOutsideShading: str (see: outsideShadingFunctions above)
  //   }

  var task = event.data;
  var array8 = new Uint8Array(task.size.w * task.size.h);

  juliaQ2( array8, task );

  postMessage({array8: array8, task: task}, [array8.buffer]);
}

// filled Julia set renderer
// see 'onmessage' above for definition of 'task'
function juliaQ2( array8, task ) {

  // extract parameters into local variables
  var w = task.size.w;
  var h = task.size.h;

  var Zr = task.startZ.r;
  var Zi = task.startZ.i;

  var dZrx = task.stepX.r;
  var dZix = task.stepX.i;
  var dZry = task.stepY.r;
  var dZiy = task.stepY.i;

  var Cr = task.paramC.r;
  var Ci = task.paramC.i;

  var maxIts = task.paramMaxIts;

  var fnInsideShading = insideShadingFunctions[task.fnInsideShading];
  var fnOutsideShading = outsideShadingFunctions[task.fnOutsideShading];

  // pre-compute constant factors and divisors
  var threshold = Math.max( Math.sqrt(Cr*Cr + Ci*Ci), 2);
  var thresholdSquared = threshold*threshold;
  var rThreshold255 = 255 / threshold;
  var rMaxIts255 = 255 / (maxIts + 1);

  var idx = 0;
  for( var y = 0; y < h; ++y ) {

    var Ry = y * dZry + Zr;
    var Iy = y * dZiy + Zi;

    for( var x = 0; x < w; ++x ) {

      var zr = x * dZrx + Ry;
      var zi = x * dZix + Iy;
      
      var n = 0, distSquared;

      // the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
      for( ; n < maxIts; ++n ) {

        var zrzr = zr*zr, zizi = zi*zi;

        distSquared = zrzr + zizi;
        if( distSquared > thresholdSquared ) break;

        zi = (zr+zr) * zi + Ci;
        zr = zrzr - zizi + Cr;
      }

      array8[idx++] = n === maxIts ?
        fnInsideShading( rThreshold255, zr, zi, distSquared ) :
        fnOutsideShading( rMaxIts255, thresholdSquared, n, zr, zi, distSquared );
    }
  }
}
