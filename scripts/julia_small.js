// julia_small.js - 2016.08.16 - Atlee Brink

var juliaCanvas = document.getElementById('juliaCanvas');
var juliaContext = juliaCanvas.getContext('2d');
var juliaWidth = juliaCanvas.width;
var juliaHeight = juliaCanvas.height;
var juliaBuffer;

var juliaMaxIts;
var rjuliaMaxItsSquared;
var Cr = 0, CrBig = 0, CrSmall = 0;
var Ci = 0, CiBig = 0, CiSmall = 0;
var Zdr = 4 / (juliaWidth - 1);
var Zdi = -4 / (juliaHeight - 1);

juliaContext.fillStyle = 'rgba(0, 0, 0, 0)';
juliaContext.fillRect(0, 0, juliaWidth, juliaHeight);
juliaBuffer = juliaContext.getImageData( 0, 0, juliaWidth, juliaHeight );
juliaShowC();
juliaSetIts(50);

function juliaSetIts( value )
{
  juliaMaxIts = Number(value);
  rjuliaMaxItsSquared = 1 / (juliaMaxIts*juliaMaxIts);
  juliaShowIts();
  juliaDo();
}

function juliaSetCrBig( value ) { CrBig = Number(value); juliaSetC(); }
function juliaSetCrSmall( value ) { CrSmall = Number(value); juliaSetC(); }
function juliaSetCiBig( value ) { CiBig = Number(value); juliaSetC(); }
function juliaSetCiSmall( value ) { CiSmall = Number(value); juliaSetC(); }

function juliaSetC()
{
  Cr = CrBig + CrSmall;
  Ci = CiBig + CiSmall;
  juliaShowC();
  juliaDo();
}

function juliaShowC()
{
  document.getElementById('juliaC').innerHTML =
    Cr.toFixed(5) + (Ci >= 0 ? " + " : " - ") + Math.abs(Ci).toFixed(5) + "i";
}

function juliaShowIts()
{
  document.getElementById('juliaMaxIts').innerHTML =
    "maximum " + juliaMaxIts.toFixed(0) + " iteration" + (juliaMaxIts == 1 ? "" : "s");
}

function juliaDo()
{
  juliaQ2( juliaBuffer, -2, 2, Zdr, Zdi, Cr, Ci, Math.max( Math.sqrt(Cr*Cr + Ci*Ci), 2 ), juliaMaxIts, rjuliaMaxItsSquared );
  juliaContext.putImageData( juliaBuffer, 0, 0 );
}
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
