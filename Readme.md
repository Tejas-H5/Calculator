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

### What do I want to add next?

- tensors like `[]1200x720x...`
    - need a way to index into the tensor, like [0][0][0];
- functions

- Some way to draw things
- A C++ port ?
- Hex, binary, custom base numbers
- Times
    - like `1:20am` and then we can add/subtract them to get durations and such
    - Also dates
    - And numbers with arbitrary units
- Big numbers. unlimited size numbers. and manually implement arithmetic
    - Might just yoink someone else's library for this. I can't be bothered
    - This is quite hard to get right, I will try again later

### What do I want to remove?
- `[ERROR]: Argument 0 to function sin was of type ERROR, but it wants NUMBER`
    - such a dumb error. but it is hard to remove. or maybe it is easy and I haven't thought about it enough. 