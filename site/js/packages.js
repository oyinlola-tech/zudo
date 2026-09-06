// Zudo Packages Page Scripts

(function() {
  var filterBtns = document.querySelectorAll('.filter-btn');
  var sections = document.querySelectorAll('section[data-category]');
  var pkgCards = document.querySelectorAll('.pkg-card');
  var searchInput = document.getElementById('pkgSearch');

  // Filter by category
  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterBtns.forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      var filter = btn.getAttribute('data-filter');

      sections.forEach(function(section) {
        if (filter === 'all') {
          section.style.display = '';
        } else {
          var category = section.getAttribute('data-category');
          if (category === filter) {
            section.style.display = '';
          } else {
            section.style.display = 'none';
          }
        }
      });

      // Reset search when changing filter
      if (searchInput) {
        searchInput.value = '';
        pkgCards.forEach(function(card) {
          card.style.display = '';
        });
      }
    });
  });

  // Quick search filter
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var query = searchInput.value.toLowerCase().trim();

      // Reset category filter to "All"
      filterBtns.forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      var allBtn = document.querySelector('.filter-btn[data-filter="all"]');
      if (allBtn) {
        allBtn.classList.add('active');
        allBtn.setAttribute('aria-pressed', 'true');
      }
      sections.forEach(function(section) {
        section.style.display = '';
      });

      pkgCards.forEach(function(card) {
        if (!query) {
          card.style.display = '';
          return;
        }
        var name = (card.getAttribute('data-name') || '').toLowerCase();
        var desc = (card.getAttribute('data-desc') || '').toLowerCase();
        if (name.includes(query) || desc.includes(query)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }
})();
