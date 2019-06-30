export class FatalError {
  private parentElement: HTMLElement;
  private container: HTMLDivElement;
  private cause: string;

  constructor(cause: string, parentElement: HTMLElement) {
    this.parentElement = parentElement;
    this.container = document.createElement('div');
    this.cause = cause;
    this.display();
  }

  private styleContainer(container: HTMLDivElement): void {
    container.style.left = '0';
    container.style.top = '0';
    container.style.position = 'fixed';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.backgroundColor = 'red';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
  }

  private display(): void {
    const container = this.container;
    this.styleContainer(container);
    container.innerText = this.cause;
    this.parentElement.appendChild(this.container);
  }
}