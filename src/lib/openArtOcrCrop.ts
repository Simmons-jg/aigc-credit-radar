interface ComponentBox {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
}

export async function createOpenArtCreditBadgeOcrFile(file: File): Promise<File | undefined> {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;

  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(image.src);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const digitBox = findLikelyCreditDigitBox(imageData);
  if (!digitBox) return undefined;

  const output = renderBinaryCrop(imageData, digitBox);
  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
  if (!blob) return undefined;

  return new File([blob], "openart-credit-badge.png", { type: "image/png" });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error("Unable to load screenshot image."));
    };
    image.src = URL.createObjectURL(file);
  });
}

function findLikelyCreditDigitBox(imageData: ImageData) {
  const components = findGreenGlyphComponents(imageData)
    .filter((component) => isLikelyBadgeGlyph(component, imageData.width, imageData.height))
    .sort((a, b) => a.x - b.x);
  if (components.length === 0) return undefined;

  const rows = groupComponentsByRow(components, imageData.height);
  const badgeRow = rows
    .filter((row) => row.length > 0)
    .sort((a, b) => scoreBadgeRow(b, imageData.width) - scoreBadgeRow(a, imageData.width))[0];
  if (!badgeRow) return undefined;

  const sorted = [...badgeRow].sort((a, b) => a.x - b.x);
  const digitComponents =
    sorted.length >= 3 ? sorted.slice(1, -1) : sorted.length === 2 ? [sorted[1]] : [sorted[0]];
  if (digitComponents.length === 0) return undefined;

  return expandBox(unionBoxes(digitComponents), imageData.width, imageData.height, 3);
}

function findGreenGlyphComponents(imageData: ImageData) {
  const { data, width, height } = imageData;
  const size = width * height;
  const mask = new Uint8Array(size);
  const visited = new Uint8Array(size);

  for (let index = 0; index < size; index += 1) {
    const offset = index * 4;
    if (isOpenArtGreenGlyphPixel(data[offset], data[offset + 1], data[offset + 2])) {
      mask[index] = 1;
    }
  }

  const components: ComponentBox[] = [];
  const stack: number[] = [];

  for (let index = 0; index < size; index += 1) {
    if (!mask[index] || visited[index]) continue;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    stack.push(index);
    visited[index] = 1;

    while (stack.length > 0) {
      const current = stack.pop()!;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= size || visited[neighbor] || !mask[neighbor]) continue;
        const neighborX = neighbor % width;
        if (Math.abs(neighborX - x) > 1) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    components.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      area,
    });
  }

  return components;
}

function isOpenArtGreenGlyphPixel(red: number, green: number, blue: number) {
  return green > 105 && green > red + 35 && green >= blue - 12;
}

function isLikelyBadgeGlyph(component: ComponentBox, imageWidth: number, imageHeight: number) {
  if (component.area < 12) return false;
  if (component.height < 7 || component.width < 2) return false;
  if (component.y > imageHeight * 0.45) return false;
  if (component.width > imageWidth * 0.22) return false;
  if (component.height > imageHeight * 0.28) return false;
  return true;
}

function groupComponentsByRow(components: ComponentBox[], imageHeight: number) {
  const tolerance = Math.max(10, imageHeight * 0.035);
  const rows: ComponentBox[][] = [];

  for (const component of components) {
    const centerY = component.y + component.height / 2;
    const row = rows.find((candidate) => {
      const candidateCenterY =
        candidate.reduce((sum, item) => sum + item.y + item.height / 2, 0) / candidate.length;
      return Math.abs(candidateCenterY - centerY) <= tolerance;
    });

    if (row) {
      row.push(component);
    } else {
      rows.push([component]);
    }
  }

  return rows;
}

function scoreBadgeRow(row: ComponentBox[], imageWidth: number) {
  const box = unionBoxes(row);
  const topBonus = 1 / Math.max(1, box.y + 1);
  const structureBonus = row.length >= 3 ? 4 : row.length;
  const widthPenalty = box.width > imageWidth * 0.72 ? -2 : 0;
  return structureBonus + topBonus + widthPenalty;
}

function unionBoxes(boxes: ComponentBox[]) {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width - 1));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height - 1));
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    area: boxes.reduce((sum, box) => sum + box.area, 0),
  };
}

function expandBox(box: ComponentBox, imageWidth: number, imageHeight: number, padding: number) {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const right = Math.min(imageWidth, box.x + box.width + padding);
  const bottom = Math.min(imageHeight, box.y + box.height + padding);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    area: box.area,
  };
}

function renderBinaryCrop(imageData: ImageData, box: ComponentBox) {
  const scale = Math.max(6, Math.min(14, Math.floor(220 / Math.max(box.width, box.height))));
  const output = document.createElement("canvas");
  output.width = box.width * scale;
  output.height = box.height * scale;
  const context = output.getContext("2d");
  if (!context) return output;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.fillStyle = "#000000";

  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const sourceX = box.x + x;
      const sourceY = box.y + y;
      const offset = (sourceY * imageData.width + sourceX) * 4;
      if (isOpenArtGreenGlyphPixel(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2])) {
        context.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }

  return output;
}
