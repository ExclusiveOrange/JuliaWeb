// julia_small.js - 2016.08.08 - Atlee Brink

function juliaQ2( image, Zr, Zi, Zdr, Zdi, Cr, Ci, threshold, maxits, nscale )
{
	// pre-dereference
	var xlim = image.width;
	var ylim = image.height;
	var data = image.data;

	// pre-compute constant factors and divisors
	var thresholdSquared = threshold*threshold;
	var rThreshold255 = 255 / threshold;
	var rMaxIts255 = 255 / maxits;

	// index of first pixel alpha: step by 4 bytes after this
	var i = 3; 

	// vertical scan
	for( var y = 0; y < ylim; ++y ) {

		var I = y * Zdi + Zi;

		// horizontal scan
		for( var x = 0; x < xlim; ++x ) {

			var stayed = true;
			var zr = x * Zdr + Zr;
			var zi = I;
			var lastn = 0, distSquared;

			// the most intensive part: see how many iterations it takes for the sequence to escape (if it does)
			for( var n = 0; n < maxits; ++n ) {

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

			// compute the 'color' and store it to this pixel
			data[i] = stayed ? Math.sqrt(distSquared) * rThreshold255 : (lastn + thresholdSquared / Math.sqrt(distSquared)) * rMaxIts255;
			i += 4;
		}
	}
}
