# A general-purpose programming-based calculator (try it [here](https://el-tejaso.github.io/Calculator/calculator.html))
A calculator made in javascript. Initially practice for writing a parser for a programming language, it now has several tangential features, and I want to see how far I can push it till either JavaScript is too slow, or the code of my vanilla-js minimalist no-tech stack becomes unmaintainable (some may look at the codebase now and think it already is, but I would disagree).

## Immediate next steps

- Finish graphing algorithm.
    - Graphing algorithm - add popping out an output to fullscreen view
    
- Theme. 
    - convert everything to dark theme
    - Methods and function calls should have different syntax highlighting

- THen, Mainly bugfixes.
    - Better error reporting. Right now, our error is "couldn't read blah". really, as we are parsing, we should keep track of which error was furthest along in the code, and then report that one instead, as that will probably be what we want to fix.
    - Get this to work properly:
    ```
    funcs := <>
    for i := 0; i < 10; i+=1 {
        funcs += (f(x) := 2 * x)
    }

    graph(funcs, 0, 1);

- A button to share a link to a computation. May run into a URL length limit but thats fine
- A button next to an output to copy it to the clipboard


    ```
- Then, set up node so that we can use modules. And then set up a minifier and maybe a transpiler. And html`` and css`` type string literals.




## Overarching Feature plans

- 2D/3D wireframe/mesh visualisation
    - vector/matrix/quaternion funcs
        - Tensors already exist, and matrix multiplication already exists (I couldn't figure out Tensor multiplication, also I don't know how useful that would be to sink a couple weeks into)
- Audio generation and visualisation
- Some way to bind a program variable to UI that a user can interact with and rerun the program
- Some way to bind a program variable to time and rerun the program with requestAnimationFrame
- Some way to bind a program variable to key inputs?

## Known issues
- Interpreter errors are not being propagated correctly at the moment
- A lot more