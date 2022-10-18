# What is this?
A calculator made in javascript. 
It is a calculator that was made by actually parsing an AST, and not by calling `eval` like you see in all those javascript tutorials.
It isn't actually supposed to be mathematically accurate, it is just practice for writing a parser and an evaluator.
I find it much faster to iterate on javascript + HTML than I do with anything else

### Current feature set:
- Operators
    - `+ - * / %`
- Grouping things with braces
- Negative numbers (new)
    - yeah I forgot to add this the first time around
- Builtin functions
    - `sin cos tan ceil floor .....`
- variables
- ternary operator like condition ? x : y
- tensors like `T(1200, 700)`
- For loop construct.
    - classic init, check, iterate c style
- user defined functions
- common math funcs
    - matrix multiplication

### What do I want to add next?
- range based for loop construct.
    - `for i in [thing]`
    - I dont care for it at the moment

- more common math funcs
    - vector math
        - cross product
    - quaternions

- `mesh()` function that accepts a list of vertices and triangle indices, and generates a 3D Mesh
- `image()` function that accepts a matrix and displays it as an image
- `plot()` function that accepts two lists, and plots x and ys with a line

- Parser component rewrite
    - there are actually a lot of bugs and edge cases in the parser as a result of a few design errors due to a lack of planning.
    - I have ran into a couple and I can't be bothered fixing them just yet

- array programming like in Sverchok blender addon. basically, a node that was like f(x : float) -> float would implicitly be f(x : float[]) -> float[] by applying the function elementwise, and the number of dimensions is infinite.
    - If a function expects types (T1, T2, ... , Tn), then we first check if the arguments passed in were correct, and evaluate normally.
    Else, we see which arguments are of type T1[][]..., and then we go ahead and invoke the function multiple times for every value of T1 in the array, for each argument.
        - order can be non-deterministic

- Hex, binary, custom base numbers

- Times
    - like `1:20am` and then we can add/subtract them to get durations and such
    - Also dates
    - And numbers with arbitrary units
        - not clear how I would do this just yet

### If this is actually good:

- A C++/Rust port ?
    - most likely will be rust, as that is easier to program this in
        - really good use case for web-assembly