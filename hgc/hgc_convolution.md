this small tool explains how convolution works. 

there will be a input image on the left and a kernel/filter on the right. 

the run of the convolution will be visualized with a grid (the kernel) that is overlayed over the image and moves by the stride size. 
optionally padding can be added to the input image. 

the default input image is 32x32x1

the kernel / filter values can be changed by entering a number on each kernel cell or by using a callback function 


problem: 
the convolution demo is nice but after the user understands a convolution , they become inpatient and running own custom code examples takes ages
possible solution: 
- add a 'instant convolve ' option 


problem: 
the user does not yet know what a convolution is and has to learn step by step
possible solution:
- a good simple step by step tutorial learn everything one by one from absolute basics to full complex examples. 
- learn first only what a pixel is, 0 = black, 255 or 1.0 = white
    - learn what a sum of a kernel is and how it is calculated and why the resulting pixel looks like it looks


problem: 
the convolution examples are impractical because tiny images such as 32x32 displayed in a large area are not realistic
possible solution: 
provide much larger images and add real world default images , like an image of a cat. 