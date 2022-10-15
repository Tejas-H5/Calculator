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
### What do I want to add next?
- range based for loop construct.
    - `for i in [thing]`
    - I dont care for it at the moment

- common math funcs
    - matrix multiplication
    - vector math
    - quaternions

- `mesh()` function that accepts a list of vertices and triangle indices, and generates a 3D Mesh
- `image()` function that accepts a matrix and displays it as an image
- `plot()` function that accepts two lists, and plots x and ys with a line

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

### The near distant future
- Big numbers. unlimited size numbers. and manually implement arithmetic
    - Might just yoink someone else's library for this. I can't be bothered
    - Turns out this is quite hard to get right, I will try again later
- A C++/Rust port ?
    - most likely will be rust, as that is easier to program this in

### What do I want to remove?
- `[ERROR]: Argument 0 to function sin was of type ERROR, but it wants NUMBER`
    - such a dumb error. but it is hard to remove. or maybe it is easy and I haven't thought about it enough. 


### Have I learned anything from this?

I had originally imagined parsing to be much harder, but when you think about the text as having a tree-like structure, it makes a lot more sense and even becomes quite simple. 
The algorithm to index into a tensor and get another tensor/assign to locations in a tensor is far more complicated than any of the parser, despite being a completely unrelated side-tangent.

Initially (and even now), I had a parser architecture where  I would parse something, and if it was not the thing I wanted, I would return false at some point, and propagate this upwards. 
However, there are times where I will have parsed this thing, and then realized that it wasnt it, but then when I am parsing the next thing, I am doing all of the work done by the previous thing all over again. 
For example, if I want to parse a function call, I will first parse an identifier (being the name of the function), then look for an open brace, followed by a comma separated list of expressions and then a closing brace. 
If I don't find the brace, I will know that it wasn't a function call, and return false from parseFunctionCall. 
However, I will then start parsing a variable indexation. 
It is almost identical to a function call, but with square braces instead of () braces. 
We parse the identifier all over again, and then find that it isn't an indexation, etc etc. until we find that it is just a plain old variable.
This is the wrong way to think about it. Really, once an identifier is parsed, the next thing can be a function call, indexation, or nothing and so we should instead have functions named like traverseIdentifier, and so now the functions aren't responsible for parsing a specific thing, 
but traversing a type of identifier. 
But maybe I have it right. Maybe by doing this traversal approach, we loose the broader context of which the identifier was a part of. 
I think sometimes it works and sometimes it doesn't.
One thing I know for sure now is to have some sort of tree diagram displaying the parsing order of things. 
I thought that only expressions, terms, and root level things in a math expression had order operations, but turns out 
EVERYTHING IN THE LANGUAGE will have some form of precedence or whatever associated with it, and it is very easy to loose track of
what is on what level and make an incorrect parsing tree (which I have probably already done).
When I do this again, I will probably keep some sort of document on the side to keep track of this precedence/hierarchy tree. 
This method is also better for catching parsing errors. 
Right now, I can't catch any parsing errors because there is no guarantee that a parsing error was really a parsing error, or just an inability to parse something because it is actually something else.
If I use this traverse approach where we don't do any duplicated work, then there can be parts of the program where I am certain that e.g a user was trying to define a function but failed.