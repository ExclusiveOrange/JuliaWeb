// fractalworker.js - 2016.08.09 to 2016.09.09 - Atlee Brink

const r2PI255 = 127.5 / Math.PI
const r2PI510 = 255 / Math.PI

var FractalWorker = {
  insideShadingDefault: 'solid',
  outsideShadingDefault: 'smooth',
  renderFunctionDefault: 'Burning Ship: (|Zr| + i|Zi|)^2 + C',

  // ( constRThreshold255, lastZr, lastZi, distSquared ) -> Uint8
  insideShadingFunctions: {
    "solid": function( constRThreshold255, lastZr, lastZi, distSquared ) { return 255 },
    "smooth": function( constRThreshold255, lastZr, lastZi, distSquared ) { return Math.sqrt(distSquared) * constRThreshold255 },
    "angle": function( constRThreshold255, lastZr, lastZi, distSquared ) { return angleOf( lastZr, lastZi ) * r2PI255 },
    "dipole": function( constRThreshold255, lastZr, lastZi, distSquared ) { var angle = angleOf( lastZr, lastZi ) * r2PI510; return angle > 255 ? 510 - angle: angle },
    "chess": function( constRThreshold255, lastZr, lastZi, distSquared ) { return Math.abs(Math.floor(lastZr) + Math.floor(lastZi)) % 2 > 0 ? Math.sqrt(distSquared) * constRThreshold255: 0 },
    "outside-color":  function( constRThreshold255, lastZr, lastZi, distSquared ) { return 0 }
  },

  // ( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) -> Uint8
  outsideShadingFunctions: {
    "solid": function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return 0 },
    "smooth": function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return (lastn + constThresholdSquared / Math.sqrt(distSquared)) * constRMaxIts255 },
    "angle": function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return angleOf( lastZr, lastZi ) * r2PI255 },
    "dipole": function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { var angle = angleOf( lastZr, lastZi ) * r2PI510; return angle > 255 ? 510 - angle: angle },
    "layers": function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return 255 * (Math.sqrt(constThresholdSquared) / Math.sqrt(distSquared)) },
    "chess": function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return Math.abs(Math.floor(lastZr) + Math.floor(lastZi)) % 2 > 0 ? 255 * ( Math.sqrt(constThresholdSquared) / Math.sqrt(distSquared) ): 0 },
    "inside-color": function( constRMaxIts255, constThresholdSquared, lastn, lastZr, lastZi, distSquared ) { return 255 }
  },

  renderFunctions: {
    "Julia: Z^2 + C": renderJuliaZ2C,
    "Julia: (|Zr| + i|Zi|)^2 + C": renderJuliaBurningShip,
    "Mandelbrot: Z^2 + C": renderMandelbrot,
    "Burning Ship: (|Zr| + i|Zi|)^2 + C": renderBurningShip
  }
}

// utility
function angleOf( x, y ) {
  if( x === 0 ) {
    if( y === 0 ) return 0.0;
    else if( y > 0 ) return Math.PI * 0.5;
    return Math.PI * 1.5;
  }
  if( y === 0 ) {
    if( x > 0 ) return 0.0;
    return Math.PI;
  }
  if( x > 0 ) {
    if( y > 0 ) return Math.atan( y / x );
    return Math.PI + Math.PI + Math.atan( y / x );
  }
  return Math.PI + Math.atan( y / x )
}

function angleOfPi( x, y ) {
  if( x === 0 ) {
    if( y === 0 ) return 0.0;
    else if( y > 0 ) return Math.PI * 0.5;
    return Math.PI * -0.5;
  }
  if( y === 0 ) {
    if( x > 0 ) return 0.0;
    return Math.PI;
  }
  if( x > 0 ) {
    if( y > 0 ) return Math.atan( y / x );
    return Math.atan( y / x );
  }
  return Math.atan( y / x )
}

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
  //     fnRender: str (see: renderFunctions above)
  //   }

  var task = event.data
  var array8 = new Uint8Array(task.size.w * task.size.h) // Reallocating memory hundreds of times per second is stupid but necessary in JavaScript. Thanks JavaScript.

  FractalWorker.renderFunctions[ task.fnRender ]( array8, task )

  postMessage({array8: array8, task: task}, [array8.buffer])
}

////////////////////////////////////////
// render functions
// note: until JavaScript optimizing compilers get smarter about inlining small functions,
//       monolithic rendering functions seem to perform much better.
////////////////////////////////////////

////////////////////////////////////////
// Julia: Z^2 + C
////////////////////////////////////////
function renderJuliaZ2C( array8, task ) {

  // extract parameters into local variables
  var w = task.size.w, h = task.size.h
  var Zr = task.startZ.r, Zi = task.startZ.i
  var dZrx = task.stepX.r, dZix = task.stepX.i
  var dZry = task.stepY.r, dZiy = task.stepY.i
  var Cr = task.paramC.r, Ci = task.paramC.i

  var maxIts = task.paramMaxIts

  var fnInsideShading = FractalWorker.insideShadingFunctions[task.fnInsideShading]
  var fnOutsideShading = FractalWorker.outsideShadingFunctions[task.fnOutsideShading]

  // pre-compute constant factors and divisors
  var threshold = Math.max( Math.sqrt(Cr*Cr + Ci*Ci), 2)
  var thresholdSquared = threshold*threshold
  var rThreshold255 = 255 / threshold
  var rMaxIts255 = 255 / (maxIts + 1)

  var idx = 0
  for( var y = 0; y < h; y += 1 ) {
    var Ry = y * dZry + Zr
    var Iy = y * dZiy + Zi

    for( var x = 0; x < w; x += 1 ) {
      var zr = x * dZrx + Ry
      var zi = x * dZix + Iy
      var n = 0, distSquared

      // the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
      for( ; n < maxIts; n += 1 ) {
        var zrzr = zr*zr, zizi = zi*zi

        distSquared = zrzr + zizi
        if( distSquared > thresholdSquared ) break

        zi = (zr+zr) * zi + Ci
        zr = zrzr - zizi + Cr
      }

      if( n === maxIts ) array8[idx] = fnInsideShading( rThreshold255, zr, zi, distSquared )
      else array8[idx] = fnOutsideShading( rMaxIts255, thresholdSquared, n, zr, zi, distSquared )

      idx += 1
    }
  }
}

////////////////////////////////////////
// Julia: (|Zr| + i|Zi|)^2 + C
////////////////////////////////////////
function renderJuliaBurningShip( array8, task ) {

  // extract parameters into local variables
  var w = task.size.w, h = task.size.h
  var Zr = task.startZ.r, Zi = task.startZ.i
  var dZrx = task.stepX.r, dZix = task.stepX.i
  var dZry = task.stepY.r, dZiy = task.stepY.i
  var Cr = task.paramC.r, Ci = task.paramC.i

  var maxIts = task.paramMaxIts

  var fnInsideShading = FractalWorker.insideShadingFunctions[task.fnInsideShading]
  var fnOutsideShading = FractalWorker.outsideShadingFunctions[task.fnOutsideShading]

  // pre-compute constant factors and divisors
  var threshold = Math.max( Math.sqrt(Cr*Cr + Ci*Ci), 2)
  var thresholdSquared = threshold*threshold
  var rThreshold255 = 255 / threshold
  var rMaxIts255 = 255 / (maxIts + 1)

  function sinh( x ) { return Math.exp( x ) - Math.exp( -x ) }
  function cosh( x ) { return Math.exp( x ) + Math.exp( -x ) }

  var idx = 0
  for( var y = 0; y < h; y += 1 ) {
    var Ry = y * dZry + Zr
    var Iy = y * dZiy + Zi

    for( var x = 0; x < w; x += 1 ) {
      var zr = x * dZrx + Ry
      var zi = x * dZix + Iy
      var n = 0, distSquared

      // the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
      for( ; n < maxIts; n += 1 ) {
        var zrzr = zr*zr, zizi = zi*zi

        distSquared = zrzr + zizi
        if( distSquared > thresholdSquared ) break

        zi = 2 * Math.abs( zr * zi ) + Ci
        zr = zrzr - zizi + Cr
      }

      if( n === maxIts ) array8[idx] = fnInsideShading( rThreshold255, zr, zi, distSquared )
      else array8[idx] = fnOutsideShading( rMaxIts255, thresholdSquared, n, zr, zi, distSquared )

      idx += 1
    }
  }
}

////////////////////////////////////////
// Mandelbrot: Z^2 + C
////////////////////////////////////////
function renderMandelbrot( array8, task ) {

  // extract parameters into local variables
  var w = task.size.w, h = task.size.h
  var Zr = task.startZ.r, Zi = task.startZ.i
  var dZrx = task.stepX.r, dZix = task.stepX.i
  var dZry = task.stepY.r, dZiy = task.stepY.i
  var constCr = task.paramC.r, constCi = task.paramC.i

  var maxIts = task.paramMaxIts

  var fnInsideShading = FractalWorker.insideShadingFunctions[task.fnInsideShading]
  var fnOutsideShading = FractalWorker.outsideShadingFunctions[task.fnOutsideShading]

  // pre-compute constant factors and divisors
  var threshold = Math.max( Math.sqrt(constCr*constCr + constCi*constCi), 2)
  var thresholdSquared = threshold*threshold
  var rThreshold255 = 255 / threshold
  var rMaxIts255 = 255 / (maxIts + 2)

  var idx = 0
  for( var y = 0; y < h; y += 1 ) {
    var Ry = y * dZry + Zr
    var Iy = y * dZiy + Zi

    for( var x = 0; x < w; x += 1 ) {
      var Cr = x * dZrx + Ry, Ci = x * dZix + Iy
      var zr = constCr, zi = constCi
      var n = 0, distSquared

      // the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
      for( ; n < maxIts; n += 1 ) {
        var zrzr = zr*zr, zizi = zi*zi

        distSquared = zrzr + zizi
        if( distSquared > thresholdSquared ) break

        zi = (zr+zr) * zi + Ci
        zr = zrzr - zizi + Cr
      }

      if( n === maxIts ) array8[idx] = fnInsideShading( rThreshold255, zr, zi, distSquared )
      else array8[idx] = fnOutsideShading( rMaxIts255, thresholdSquared, n, zr, zi, distSquared )

      idx += 1
    }
  }
}

////////////////////////////////////////
// Burning Ship: (|Zr| + i|Zi|)^2 + C
////////////////////////////////////////
function renderBurningShip( array8, task ) {

  // extract parameters into local variables
  var w = task.size.w, h = task.size.h
  var Zr = task.startZ.r, Zi = task.startZ.i
  var dZrx = task.stepX.r, dZix = task.stepX.i
  var dZry = task.stepY.r, dZiy = task.stepY.i
  var constCr = task.paramC.r, constCi = task.paramC.i

  var maxIts = task.paramMaxIts

  var fnInsideShading = FractalWorker.insideShadingFunctions[task.fnInsideShading]
  var fnOutsideShading = FractalWorker.outsideShadingFunctions[task.fnOutsideShading]

  // pre-compute constant factors and divisors
  var threshold = Math.max( Math.sqrt(constCr*constCr + constCi*constCi), 2)
  var thresholdSquared = threshold*threshold
  var rThreshold255 = 255 / threshold
  var rMaxIts255 = 255 / (maxIts + 1)

  function sinh( x ) { return Math.exp( x ) - Math.exp( -x ) }
  function cosh( x ) { return Math.exp( x ) + Math.exp( -x ) }

  var idx = 0
  for( var y = 0; y < h; y += 1 ) {
    var Ry = y * dZry + Zr
    var Iy = y * dZiy + Zi

    for( var x = 0; x < w; x += 1 ) {
      var Cr = x * dZrx + Ry, Ci = x * dZix + Iy
      var zr = constCr, zi = constCi
      var n = 0, distSquared

      // the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
      for( ; n < maxIts; n += 1 ) {
        var zrzr = zr*zr, zizi = zi*zi

        distSquared = zrzr + zizi
        if( distSquared > thresholdSquared ) break

        zi = 2 * Math.abs( zr * zi ) + Ci
        zr = zrzr - zizi + Cr
      }

      if( n === maxIts ) array8[idx] = fnInsideShading( rThreshold255, zr, zi, distSquared )
      else array8[idx] = fnOutsideShading( rMaxIts255, thresholdSquared, n, zr, zi, distSquared )

      idx += 1
    }
  }
}

// END
