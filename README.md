# Vision Lab

Interactive web apps for developers learning how computer vision models work.
Change an image, edit a filter, or write a JavaScript callback, then step
through the calculation and inspect the numbers.

## Run locally

Install [Deno 2](https://docs.deno.com/runtime/getting_started/installation/),
clone or download this repository, and run from its root directory:

```sh
deno task start
```

Dependencies install automatically on the first run, which needs internet
access. Open the local URL printed in the terminal (normally
`http://localhost:8000`). Both labs run locally with the same command.

## Available labs

| Lab                                  | What you can explore                                                                                                     | App path        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------- |
| [Convolution](Convolution/README.md) | Slide a kernel over an image; change weights, stride, and padding; inspect each multiplication and sum.                  | `/convolution/` |
| [LeNet-5](LeNet-5/README.md)         | Draw or upload a digit, follow it through a neural network, inspect feature maps, and modify activations with callbacks. | `/`             |

Start with **Convolution** to understand a single operation, then explore
**LeNet-5** to see how layers fit together. Switch labs using the app header.

**LeNet-5 uses untrained weights:** its output demonstrates computation, not
meaningful digit predictions. Training is not implemented.

## More details

The lab links above contain usage instructions and examples. See the
[development guide](docs/development.md) for configuration, tests, and the
Vue/Deno/WebSocket architecture.
