/**
 * Minimal Mustache-style HTML template renderer.
 *
 * Supports:
 *   {{KEY}}                    — global variable substitution
 *   <!-- {{#EACH_ROW}} -->     — open row loop (HTML comment markers)
 *   <!-- {{/EACH_ROW}} -->     — close row loop
 *
 * Inside the loop block, {{KEY}} tokens are replaced per-row from the
 * corresponding row object. Global variables are applied after row
 * substitution so they can appear both inside and outside loops.
 */

/**
 * @param {string} html         Template source HTML
 * @param {object} globals      Key→value map for {{KEY}} substitution outside loops
 * @param {object[]} [rows]     Array of row objects for {{#EACH_ROW}} blocks
 * @returns {string}
 */
export function renderTemplate(html, globals, rows = []) {
  // Expand each row loop block
  html = html.replace(
    /<!--\s*\{\{#EACH_ROW\}\}\s*-->([\s\S]*?)<!--\s*\{\{\/EACH_ROW\}\}\s*-->/g,
    (_, block) => rows.map(row => applyVars(block, row)).join(''),
  );

  // Apply globals
  return applyVars(html, globals);
}

/**
 * Replace all {{KEY}} tokens in str with values from vars.
 * Unknown keys are left as-is.
 * @param {string} str
 * @param {object} vars
 * @returns {string}
 */
function applyVars(str, vars) {
  return str.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? '') : match,
  );
}
