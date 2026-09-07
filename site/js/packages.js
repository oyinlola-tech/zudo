// Zudo Packages Page Scripts

(function() {
  var filterBtns = document.querySelectorAll('.filter-btn');
  var sections = document.querySelectorAll('section[data-category]');
  var pkgCards = document.querySelectorAll('.pkg-card');
  var searchInput = document.getElementById('pkgSearch');
  var versionSelect = document.getElementById('versionSelect');
  var visibleCountEl = document.getElementById('visibleCount');
  var currentVersion = versionSelect ? versionSelect.value : '0.1.0';
  var currentCategory = 'all';
  var currentSearch = '';

  // Update visible count
  function updateVisibleCount() {
    var visible = 0;
    sections.forEach(function(section) {
      if (section.style.display !== 'none') {
        var cards = section.querySelectorAll('.pkg-card');
        cards.forEach(function(card) {
          if (card.style.display !== 'none') {
            visible++;
          }
        });
      }
    });
    if (visibleCountEl) {
      visibleCountEl.textContent = visible;
    }
  }

  // Apply all filters
  function applyFilters() {
    // Filter by version
    pkgCards.forEach(function(card) {
      var cardVersion = card.getAttribute('data-version') || '0.0.1';
      var matchesVersion = cardVersion === currentVersion;
      var matchesSearch = true;
      
      if (currentSearch) {
        var name = (card.getAttribute('data-name') || '').toLowerCase();
        var desc = (card.getAttribute('data-desc') || '').toLowerCase();
        matchesSearch = name.includes(currentSearch) || desc.includes(currentSearch);
      }
      
      card.style.display = (matchesVersion && matchesSearch) ? '' : 'none';
    });

    // Filter sections by category and hide empty ones
    sections.forEach(function(section) {
      var category = section.getAttribute('data-category');
      var matchesCategory = currentCategory === 'all' || category === currentCategory;
      var hasVisibleCards = section.querySelectorAll('.pkg-card[style=""], .pkg-card:not([style])').length > 0;
      
      section.style.display = (matchesCategory && hasVisibleCards) ? '' : 'none';
    });

    updateVisibleCount();
  }

  // Filter by category
  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterBtns.forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      currentCategory = btn.getAttribute('data-filter');
      applyFilters();
    });
  });

  // Version filter
  if (versionSelect) {
    versionSelect.addEventListener('change', function() {
      currentVersion = versionSelect.value;
      applyFilters();
    });
  }

  // Quick search filter
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      currentSearch = searchInput.value.toLowerCase().trim();
      
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
      currentCategory = 'all';
      
      applyFilters();
    });
  }

  // Initialize count
  updateVisibleCount();
})();
