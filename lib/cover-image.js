// Browser only: turns a picked picture into the strip at the top of a game's card (4:1, a JPEG).

export function cropToStrip(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = 1200;
      const height = 300;
      const scale = Math.max(width / image.width, height / image.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, (width - image.width * scale) / 2, (height - image.height * scale) / 2, image.width * scale, image.height * scale);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("crop"))), "image/jpeg", 0.88);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("read"));
    };
    image.src = url;
  });
}
