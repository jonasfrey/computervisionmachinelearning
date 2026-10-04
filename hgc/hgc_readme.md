
goal 
a webapp that helps the user learn how computer vision ai models work. 

below is a list of problems that can occur during the user webapp usage and what possible solutions there are to solve them. 

target audience: 
software developers with a lot of experience in all common languages, C , Rust, Javascript , Python , and so on


problem: 
there is no learning effect because the user does not need to solve a problem, or because the user cannot interact and see their cchanges but only look at the workflow like a movie
possible solution: 
- use callback functions wherever possible so that the user can interact with the workflow or demo in realtime by writing simple code snippets 

problem: 
important steps of a simulation are executed in the background and not visually presented to the user
possible solution:
- each step should be visualized if possible. if it is not practical to show something because it would take to long it should be demonstrated on a short pseudo example : for example  a convolution over a 512x512 image would take forever , so use a 3x3 image as an example.  

problem: 
the user does not see what is going on in the code
possible solution: 
- a good logging mechanism, that shows (only crucial messages) what happens in the browser client and on the server.

problem: 
the user cannot understand some details and wants to know exact information
possible solution: 
also store important documents like scientific papers and link important technical details  with page or line numbers so that the user can read the detail 


problem: 
- the UI is simply to crowded. for advanced users it makes sense to see all details but for a quick look it is overwhelming. 
possible solution: 
- provide the most accessed functions on the first layer of the GUI, so that no overlay has to be opened. 
- use icons/pictograms. they often tell a lot more than having to read complex long text 
- use tool tip text when hovering over an item with complex functionality (buttons with icons , and others)


problem:
- visual data , like files that are uploaded or used (/svg/ images/ videos other media ) cannot be seen visually  at all or are simply to small to be seen detailed
possible solution:
- wherever a visual content is used , do not only present it as 'filename.jpg' but also add a small preview that can be zoomed in with mousewheel and transformed with drag n drop  to be able to inspect it
 


tech stack 

client js vue js, simple pragmatic global state
server , denojs can call any executable via Deno.command 
communication websocket wherever possible  

startup , one command only 'deno task start' , will install everything required (if not already done) and start the app


