export const enum ImageQuality {
  Lowest = 0,
  Low,
  Medium,
  High,
  Highest
};

export class ImageQualityManager {
  private quality: ImageQuality;
  private isDirty: boolean;

  constructor(initialQuality: ImageQuality) {
    this.quality = initialQuality;
    this.isDirty = true;
  }

  needsUpdate(): boolean {
    return this.isDirty;
  }

  clearNeedsUpdate(): void {
    this.isDirty = false;
  }

  getQuality(): ImageQuality {
    return this.quality;
  }

  cycleQuality(): void {
    this.quality++;

    if (this.quality > ImageQuality.Highest) {
      this.quality = ImageQuality.Lowest;
    }

    this.isDirty = true;
  }

  setQuality(quality: ImageQuality): void {
    this.isDirty = quality !== this.quality;
    this.quality = quality;
  }
}

export function getDpr(forQuality: ImageQuality): number {
  switch (forQuality) {
    case ImageQuality.Lowest:
      return 0.5;
    case ImageQuality.Low:
      return 0.75;
    case ImageQuality.Medium:
    case ImageQuality.High:
      return 1;
    case ImageQuality.Highest:
      return window.devicePixelRatio || 1;
  }
}