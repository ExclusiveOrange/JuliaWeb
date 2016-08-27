# JuliaWeb

A web-based, interactive fractal explorer.
Initially just for approximating the filled Julia set of the complex quadratic,
but now also does mutatable versions of the Mandelbrot set of the complex quadratic,
and the "Burning Ship" and its Julia set.

## What

A [fractal](http://en.wikipedia.org/wiki/Fractal) is a particular type of thing that has a self-repeating pattern.
This fractal explorer makes interactive pictures of certain kinds of fractals.
It might be that the mutatable Mandelbrot and mutatable Burning Ship aren't technically fractals, but I don't care.

## Why

Because neat things are neat.

![tiny-carpets](screenshots/tiny-carpets.png?raw=true "Tiny Carpets")
![neato](screenshots/neato.png?raw=true "Neato")

## How

Fractals of this sort can be imaged (approximately) by doing many maths ---
particularly, simple repetitive arithmetic.
The procedure is very simple, but to make a *neat* image, a great many arithmetics are needed.
This fractal explorer uses JavaScript and some features of HTML5 to convince a computer to do all the arithmetics
in the right way, and then to display an image for humans.

## Where

[This thing in action.](http://atleebrink.com/julia.html)
