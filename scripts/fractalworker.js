// fractalworker.js - 2016.08.09 to 2016.08.15 - Atlee Brink
// note: I lovingly crafted these artisanal bespoke codes with my own hands.
//       If you like them, please let me know at: atlee at atleebrink.com

// in-color functions:
//   ( constRThreshold255, lastZr, lastZi, distSquared ) -> Uint8
var inColorDefault = 'solid';
var inColorFunctions = {
  "clear" :  function( constRThreshold255, lastZr, lastZi, distSquared ) { return 0; },
  "solid" : function( constRThreshold255, lastZr, lastZi, distSquared ) { return 255; },
  "smooth" : function( constRThreshold255, lastZr, lastZi, distSquared ) { return Math.sqrt(distSquared) * constRThreshold255; }
};

// out-color functions:
//   ( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) -> Uint8
var outColorDefault = 'smooth';
var outColorFunctions = {
  "clear" : function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return 0; },
  "solid" : function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return 255; },
  "smooth" : function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return (lastn + constThresholdSquared / Math.sqrt(distSquared)) * constRMaxIts255; }
};

// Web Worker message catcher
onmessage = function( event ) {
  // todo: use transferables to avoid reallocating, but beware: they're not well supported yet.

  // expects:
  //   event.data = {
  //     size: { w: int, h: int }
  //     startZ: { r: double, i: double }
  //     stepX: { r: double, i: double }
  //     stepY: { r: double, i: double }
  //     paramC: { r: double, i: double }
  //     paramMaxIts: int
  //     fnInColor: str (see: inColorFunctions above)
  //     fnOutColor: str (see: outColorFunctions above)
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

  var fnInColor = inColorFunctions[task.fnInColor];
  var fnOutColor = outColorFunctions[task.fnOutColor];

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

      var stayed = true;
      var zr = x * dZrx + Ry;
      var zi = x * dZix + Iy;
      var lastn = 0, distSquared, lastZr, lastZi;

      // the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
      // todo: put this entire loop in a function, so that we can (efficiently) do different fractals
      for( var n = 0; n < maxIts; ++n ) {

        var zrzr = zr*zr, zizi = zi*zi;

        distSquared = zrzr + zizi;
        if( distSquared > thresholdSquared ) {
          stayed = false;
          lastn = n;
          lastZr = zr;
          lastZi = zi;
          break;
        }

        zi = (zr+zr) * zi + Ci;
        zr = zrzr - zizi + Cr;
      }

      // note: in Safari and Firefox, using functions seems to be just as fast
      //       as inlining the math, even though the functions probably aren't using
      //       all of their parameters. Good news!
      array8[idx++] = stayed ?
        fnInColor( rThreshold255, lastZr, lastZi, distSquared ) :
        fnOutColor( rMaxIts255, thresholdSquared, lastn, lastZr, lastZi, distSquared );
    }
  }
}
