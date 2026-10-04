self.onmessage = ({ data }) => {
  const respond = self.postMessage.bind(self);
  try {
    const callback = new Function(
      "value",
      "row",
      "col",
      "size",
      `"use strict";\n${data.code}`,
    );
    const values = data.values.map((value, index) => {
      const result = callback(
        value,
        Math.floor(index / data.size),
        index % data.size,
        data.size,
      );
      if (
        typeof result !== "number" || !Number.isFinite(result) ||
        Math.abs(result) > 100
      ) {
        throw new Error(
          `Cell ${index}: return a finite number between −100 and 100.`,
        );
      }
      return result;
    });
    respond({ values });
  } catch (error) {
    respond({ error: error.message });
  }
};
