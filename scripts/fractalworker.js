// fractalworker.js - 2016.08.09 - Atlee Brink
// note: I lovingly crafted these artisanal bespoke codes with my own hands.
//       If you like them, please let me know at: atlee at atleebrink.com

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
      var lastn = 0, distSquared;

			// the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
			for( var n = 0; n < maxIts; ++n ) {

				var zrzr = zr*zr, zizi = zi*zi;

				distSquared = zrzr + zizi;
				if( distSquared > thresholdSquared ) {
					stayed = false;
					lastn = n;
					break;
				}

				zi = (zr+zr) * zi + Ci;
				zr = zrzr - zizi + Cr;
			}

			// compute the 'color' and store it to this pixel:
      //   if 'stayed', then compute an 'in color':
      //     in_color = distance from complex origin, proportional to threshold distance
      //   else compute an 'out color':
      //     out_color = (escape_iterations + measure_of_escape) / maximum_iterations_allowed 
			array8[idx++] = stayed ? Math.sqrt(distSquared) * rThreshold255 : (lastn + thresholdSquared / Math.sqrt(distSquared)) * rMaxIts255;

      // alternate: no in-color: let inky blackness melt your CPU
			//array8[idx++] = stayed ? 255 : (lastn + thresholdSquared / Math.sqrt(distSquared)) * rMaxIts255;
    }
  }
}
