// Zudo Version Management
// Handles version selection persistence across pages

(function() {
  var VERSION_KEY = 'zudo-docs-version';
  var DEFAULT_VERSION = '0.1.0';

  // Get stored version
  function getStoredVersion() {
    try {
      return localStorage.getItem(VERSION_KEY) || DEFAULT_VERSION;
    } catch (e) {
      return DEFAULT_VERSION;
    }
  }

  // Store version
  function storeVersion(version) {
    try {
      localStorage.setItem(VERSION_KEY, version);
    } catch (e) {
      // localStorage not available
    }
  }

  // Initialize version selectors on page
  function initVersionSelectors() {
    var version = getStoredVersion();
    var selects = document.querySelectorAll('#versionSelect, [data-version-select]');
    
    selects.forEach(function(select) {
      select.value = version;
      select.addEventListener('change', function() {
        storeVersion(select.value);
        // Apply version to content
        applyVersionToContent(select.value);
        // Dispatch custom event for other components
        document.dispatchEvent(new CustomEvent('zudo-version-change', {
          detail: { version: select.value }
        }));
      });
    });
  }

  // Apply version to version badges on page
  function applyVersionBadges() {
    var version = getStoredVersion();
    var badges = document.querySelectorAll('.version-badge');
    
    badges.forEach(function(badge) {
      badge.textContent = 'v' + version;
    });
  }

  // Apply version filtering to content sections
  function applyVersionToContent(version) {
    // Show/hide version-specific sections
    var versionedSections = document.querySelectorAll('[data-version]');
    versionedSections.forEach(function(section) {
      var sectionVersion = section.getAttribute('data-version');
      if (sectionVersion === version) {
        section.style.display = '';
      } else if (sectionVersion === 'all') {
        // "all" means show for every version
        section.style.display = '';
      } else {
        section.style.display = 'none';
      }
    });

    // Update version indicators
    var versionIndicators = document.querySelectorAll('.current-version');
    versionIndicators.forEach(function(el) {
      el.textContent = 'v' + version;
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initVersionSelectors();
      applyVersionBadges();
      applyVersionToContent(getStoredVersion());
    });
  } else {
    initVersionSelectors();
    applyVersionBadges();
    applyVersionToContent(getStoredVersion());
  }

  // Listen for version changes
  document.addEventListener('zudo-version-change', function(e) {
    applyVersionBadges();
  });

  // Expose API for other scripts
  window.ZudoVersion = {
    getCurrent: getStoredVersion,
    set: function(version) {
      storeVersion(version);
      applyVersionToContent(version);
      applyVersionBadges();
      // Update any selects
      var selects = document.querySelectorAll('#versionSelect, [data-version-select]');
      selects.forEach(function(select) {
        select.value = version;
      });
    }
  };
})();
