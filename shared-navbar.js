(function () {
  function initResponsiveNavbar() {
    if (document.body && document.body.classList.contains('login-page')) {
      return;
    }

    const navbars = document.querySelectorAll('.navbar');
    if (!navbars.length) {
      return;
    }

    navbars.forEach((navbar, index) => {
      const wrapper = navbar.querySelector('.navbar-wrapper');
      const menuContainer = navbar.querySelector('.menu-container');
      if (!wrapper || !menuContainer) {
        return;
      }

      if (!wrapper.querySelector('.navbar-toggle')) {
        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'navbar-toggle';
        toggleButton.setAttribute('aria-label', 'Toggle navigation menu');
        toggleButton.setAttribute('aria-expanded', 'false');

        const menuId = menuContainer.id || `navbar-menu-${index + 1}`;
        menuContainer.id = menuId;
        toggleButton.setAttribute('aria-controls', menuId);

        toggleButton.innerHTML = '<span></span><span></span><span></span>';

        const logoWrapper = wrapper.querySelector('.logo-wrapper');
        if (logoWrapper && logoWrapper.parentNode === wrapper) {
          logoWrapper.insertAdjacentElement('afterend', toggleButton);
        } else {
          wrapper.insertBefore(toggleButton, menuContainer);
        }

        toggleButton.addEventListener('click', () => {
          const isOpen = navbar.classList.toggle('menu-open');
          toggleButton.setAttribute('aria-expanded', String(isOpen));
        });

        menuContainer.querySelectorAll('a').forEach((link) => {
          link.addEventListener('click', () => {
            navbar.classList.remove('menu-open');
            toggleButton.setAttribute('aria-expanded', 'false');
          });
        });
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 600) {
        document.querySelectorAll('.navbar.menu-open').forEach((navbar) => {
          navbar.classList.remove('menu-open');
          const toggle = navbar.querySelector('.navbar-toggle');
          if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
          }
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResponsiveNavbar);
  } else {
    initResponsiveNavbar();
  }
})();
