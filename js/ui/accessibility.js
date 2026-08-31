export const initAccessibility = () => {
  const body = document.body;
  if (!body) return;

  const setKeyboard = () => body.classList.add('using-keyboard');
  const setMouse = () => body.classList.remove('using-keyboard');

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      setKeyboard();
    }
  });

  window.addEventListener('mousedown', setMouse);
};
