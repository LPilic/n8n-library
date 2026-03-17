// --- HITL Component Definitions ---
var HITL_COMPONENTS = {
  // Display
  heading:      { label: 'Heading',      icon: 'H',  category: 'display', defaults: { text: 'Heading', level: 3 } },
  text:         { label: 'Text Block',   icon: 'T',  category: 'display', defaults: { text: 'Text content', format: 'plain' } },
  'data-display': { label: 'Data Display', icon: 'D', category: 'display', defaults: { field: '', label: 'Label', format: 'text' } },
  'json-viewer':  { label: 'JSON Viewer', icon: '{}', category: 'display', defaults: { field: '' } },
  image:        { label: 'Image',        icon: 'I',  category: 'display', defaults: { field: '', alt: 'Image' } },
  badge:        { label: 'Badge',        icon: 'B',  category: 'display', defaults: { field: '', label: '', thresholds: '{"0.7":"danger","0.4":"warning","0":"success"}' } },
  divider:      { label: 'Divider',      icon: '--', category: 'display', defaults: {} },
  spacer:       { label: 'Spacer',       icon: '|',  category: 'layout', defaults: { height: 20 } },
  // Input
  'text-input': { label: 'Text Input',   icon: 'Aa', category: 'input', defaults: { name: 'field', label: 'Label', placeholder: '', required: false } },
  textarea:     { label: 'Text Area',    icon: 'P',  category: 'input', defaults: { name: 'notes', label: 'Notes', placeholder: '', required: false } },
  select:       { label: 'Select',       icon: 'V',  category: 'input', defaults: { name: 'choice', label: 'Choose', options: 'Option A, Option B, Option C', required: false } },
  checkbox:     { label: 'Checkbox',     icon: 'X',  category: 'input', defaults: { name: 'confirm', label: 'Confirm' } },
  radio:        { label: 'Radio',        icon: 'O',  category: 'input', defaults: { name: 'option', label: 'Pick one', options: 'Option A, Option B' } },
  number:       { label: 'Number',       icon: '#',  category: 'input', defaults: { name: 'amount', label: 'Amount', min: '', max: '', required: false } },
  // Layout
  columns:      { label: 'Columns',      icon: '||', category: 'layout', defaults: { count: 2 } },
  section:      { label: 'Section',      icon: '[]', category: 'layout', defaults: { title: 'Section', collapsible: false } },
  // Actions
  'button-group': { label: 'Action Buttons', icon: '>>', category: 'action', defaults: { buttons: 'approve:Approve:success,reject:Reject:danger' } },
};

// --- Form Builder State ---
var _hitlSchema = { components: [] };
var _hitlSelectedPath = null; // array path, e.g. [2] or [1,0,2] for nested
var _hitlDragType = null;
var _hitlDragSource = null; // { path: [...] } for canvas reorder
var _hitlDragField = null; // { key: 'amount', path: 'amount', value: 12500, type: 'number' } for data field drags
var _hitlEditingTemplateId = null;
var _hitlTemplates = [];
var _hitlSampleData = {};
var _hitlSampleDataStr = '{\n  "customer_name": "Acme Corp",\n  "amount": 12500,\n  "invoice_number": "INV-2024-042",\n  "ai_draft": "Dear Acme Corp,\\n\\nPlease find attached invoice for $12,500.00.",\n  "risk_score": 0.72,\n  "status": "pending_review",\n  "invoice_items": [\n    { "description": "Consulting Services", "qty": 50, "rate": 250 }\n  ]\n}';

// Path helpers
function _hitlGetByPath(path) {
  if (!path) return null;
  var list = _hitlSchema.components;
  if (path.length === 1) return list[path[0]];
  var parent = list[path[0]];
  if (!parent || !parent.children) return null;
  return (parent.children[path[1]] || [])[path[2]];
}
function _hitlGetListByPath(path) {
  if (!path) return null;
  if (path.length === 1) return _hitlSchema.components;
  var parent = _hitlSchema.components[path[0]];
  if (!parent || !parent.children) return null;
  return parent.children[path[1]];
}
function _hitlRemoveByPath(path) {
  var list = _hitlGetListByPath(path);
  if (!list) return null;
  var idx = path[path.length - 1];
  return list.splice(idx, 1)[0];
}
function _hitlPathEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
  return true;
}
function _hitlPathStr(path) {
  return path ? path.join('-') : '';
}

// Ensure a columns component has children arrays matching its count
function _hitlEnsureChildren(comp) {
  var count = (comp.props && comp.props.count) || 2;
  if (!comp.children) comp.children = [];
  while (comp.children.length < count) comp.children.push([]);
  while (comp.children.length > count) comp.children.pop();
}

// --- Builder: Initialization ---
function initHitlBuilder() {
  renderHitlPalette();
  renderHitlCanvas();
  renderHitlProps();
}

function renderHitlPalette() {
  var el = document.getElementById('hitlPalette');
  if (!el) return;
  var categories = { display: 'Display', input: 'Input', layout: 'Layout', action: 'Actions' };
  var html = '';
  for (var cat in categories) {
    html += '<div class="hitl-palette-section">' + categories[cat] + '</div>';
    for (var type in HITL_COMPONENTS) {
      var comp = HITL_COMPONENTS[type];
      if (comp.category !== cat) continue;
      html += '<div class="hitl-palette-item" draggable="true" data-type="' + type + '" ondragstart="hitlPaletteDragStart(event,\'' + type + '\')">';
      html += '<span class="hitl-palette-icon">' + comp.icon + '</span>';
      html += comp.label + '</div>';
    }
  }

  // Data Fields section
  html += '<div class="hitl-palette-section" style="display:flex;align-items:center;justify-content:space-between;margin-top:16px">';
  html += '<span>Data Fields</span>';
  html += '<div style="display:flex;gap:6px">';
  html += '<span class="hitl-palette-edit-data" onclick="hitlToggleSampleData()" title="Edit sample JSON"><i class="fa fa-pencil"></i></span>';
  html += '<span class="hitl-palette-edit-data" onclick="hitlStartCapture()" title="Listen for webhook"><i class="fa fa-wifi"></i></span>';
  html += '</div></div>';
  html += '<div id="hitlCaptureStatus"></div>';
  html += '<div id="hitlSampleDataEditor" style="display:none;margin-bottom:8px">';
  html += '<textarea id="hitlSampleDataInput" class="form-input" style="font-family:monospace;font-size:11px;min-height:120px;resize:vertical;margin-bottom:6px">' + esc(_hitlSampleDataStr) + '</textarea>';
  html += '<button class="btn btn-secondary btn-sm" onclick="hitlApplySampleData()" style="width:100%">Apply</button>';
  html += '</div>';
  html += '<div id="hitlDataFieldsList">';
  html += _renderDataFields();
  html += '</div>';

  el.innerHTML = html;
}

function hitlToggleSampleData() {
  var editor = document.getElementById('hitlSampleDataEditor');
  if (editor) editor.style.display = editor.style.display === 'none' ? '' : 'none';
}

function hitlApplySampleData() {
  var input = document.getElementById('hitlSampleDataInput');
  if (!input) return;
  try {
    _hitlSampleData = JSON.parse(input.value);
    _hitlSampleDataStr = input.value;
    var previewInput = document.getElementById('hitlPreviewData');
    if (previewInput) previewInput.value = _hitlSampleDataStr;
    var listEl = document.getElementById('hitlDataFieldsList');
    if (listEl) listEl.innerHTML = _renderDataFields();
    document.getElementById('hitlSampleDataEditor').style.display = 'none';
    toast('Sample data updated', 'success');
  } catch (e) {
    toast('Invalid JSON: ' + e.message, 'error');
  }
}

// --- Webhook Capture ---
var _hitlCaptureToken = null;
var _hitlCapturePoll = null;

async function hitlStartCapture() {
  // If already listening, stop
  if (_hitlCaptureToken) { hitlStopCapture(); return; }

  try {
    var res = await fetch(API + '/api/hitl/capture', { method: 'POST', headers: CSRF_HEADERS });
    if (!res.ok) { toast('Failed to start capture', 'error'); return; }
    var data = await res.json();
    _hitlCaptureToken = data.token;

    var webhookUrl = window.location.origin + '/api/hitl/capture/' + _hitlCaptureToken;
    var statusEl = document.getElementById('hitlCaptureStatus');
    if (statusEl) {
      statusEl.innerHTML = '<div class="hitl-capture-box">' +
        '<div class="hitl-capture-header"><span class="hitl-capture-dot"></span> Listening for webhook...</div>' +
        '<div class="hitl-capture-url">' +
          '<input type="text" class="form-input" value="' + esc(webhookUrl) + '" readonly onclick="this.select()" style="font-size:11px;font-family:monospace">' +
          '<button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\'' + esc(webhookUrl) + '\');toast(\'Copied!\',\'success\')" title="Copy"><i class="fa fa-copy"></i></button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--color-text-muted);margin-top:6px">Send a POST request with JSON body to this URL from your n8n workflow</div>' +
        '<button class="btn btn-danger btn-sm" onclick="hitlStopCapture()" style="margin-top:8px;width:100%"><i class="fa fa-stop"></i> Stop listening</button>' +
        '</div>';
    }

    // Poll every 2 seconds
    _hitlCapturePoll = setInterval(hitlPollCapture, 2000);
  } catch (e) {
    toast('Failed to start capture', 'error');
  }
}

async function hitlPollCapture() {
  if (!_hitlCaptureToken) return;
  try {
    var res = await fetch(API + '/api/hitl/capture/' + _hitlCaptureToken);
    if (!res.ok) { hitlStopCapture(); return; }
    var data = await res.json();
    if (data.captured) {
      // Got a payload!
      _hitlSampleData = data.payload;
      _hitlSampleDataStr = JSON.stringify(data.payload, null, 2);

      // Update all editors
      var previewInput = document.getElementById('hitlPreviewData');
      if (previewInput) previewInput.value = _hitlSampleDataStr;
      var sampleInput = document.getElementById('hitlSampleDataInput');
      if (sampleInput) sampleInput.value = _hitlSampleDataStr;
      var listEl = document.getElementById('hitlDataFieldsList');
      if (listEl) listEl.innerHTML = _renderDataFields();

      hitlStopCapture();
      toast('Webhook payload captured! ' + Object.keys(data.payload).length + ' fields found.', 'success');
    }
  } catch (e) {}
}

function hitlStopCapture() {
  if (_hitlCapturePoll) { clearInterval(_hitlCapturePoll); _hitlCapturePoll = null; }
  if (_hitlCaptureToken) {
    fetch(API + '/api/hitl/capture/' + _hitlCaptureToken, { method: 'DELETE', headers: CSRF_HEADERS }).catch(function(){});
    _hitlCaptureToken = null;
  }
  var statusEl = document.getElementById('hitlCaptureStatus');
  if (statusEl) statusEl.innerHTML = '';
}

function _renderDataFields() {
  try {
    _hitlSampleData = JSON.parse(_hitlSampleDataStr);
  } catch (e) { return '<div style="font-size:11px;color:var(--color-text-muted)">Invalid JSON</div>'; }
  return _renderDataFieldTree(_hitlSampleData, '');
}

function _renderDataFieldTree(obj, prefix) {
  var html = '';
  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    var val = obj[key];
    var path = prefix ? prefix + '.' + key : key;
    var vtype = _inferFieldType(val);
    var icon = _fieldTypeIcon(vtype);
    var preview = _fieldPreview(val, vtype);

    html += '<div class="hitl-palette-item hitl-data-field" draggable="true" ';
    html += 'ondragstart="hitlFieldDragStart(event,\'' + esc(path) + '\')" ';
    html += 'title="' + esc(path) + ' (' + vtype + '): ' + esc(String(val).substring(0, 80)) + '">';
    html += '<span class="hitl-palette-icon">' + icon + '</span>';
    html += '<div style="flex:1;min-width:0;overflow:hidden">';
    html += '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(key) + '</div>';
    html += '<div style="font-size:10px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + preview + '</div>';
    html += '</div></div>';

    // Recurse into objects (but not arrays)
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      html += '<div style="padding-left:12px">';
      html += _renderDataFieldTree(val, path);
      html += '</div>';
    }
  }
  return html;
}

function _inferFieldType(val) {
  if (val === null || val === undefined) return 'text';
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') {
    if (val >= 0 && val <= 1) return 'score';
    return 'number';
  }
  if (typeof val === 'string') {
    if (val.match(/^https?:\/\/.*\.(png|jpg|jpeg|gif|svg|webp)/i)) return 'image';
    if (val.length > 100) return 'longtext';
    return 'text';
  }
  if (Array.isArray(val)) return 'array';
  if (typeof val === 'object') return 'object';
  return 'text';
}

function _fieldTypeIcon(type) {
  switch (type) {
    case 'number': return '#';
    case 'score': return '%';
    case 'boolean': return '?';
    case 'text': return 'T';
    case 'longtext': return 'P';
    case 'image': return 'I';
    case 'array': return '[]';
    case 'object': return '{}';
    default: return '·';
  }
}

function _fieldPreview(val, type) {
  if (val === null || val === undefined) return '<em>null</em>';
  switch (type) {
    case 'number': case 'score': return esc(String(val));
    case 'boolean': return val ? 'true' : 'false';
    case 'array': return esc(val.length + ' items');
    case 'object': return esc(Object.keys(val).length + ' keys');
    case 'image': return '<em>image url</em>';
    case 'longtext': return esc(String(val).substring(0, 40) + '...');
    default: return esc(String(val).substring(0, 50));
  }
}

function hitlFieldDragStart(e, fieldPath) {
  var val = getNestedVal(_hitlSampleData, fieldPath);
  _hitlDragField = { path: fieldPath, value: val, type: _inferFieldType(val) };
  _hitlDragType = null;
  _hitlDragSource = null;
  e.dataTransfer.setData('text/plain', 'field:' + fieldPath);
  e.dataTransfer.effectAllowed = 'copy';
}

// Create a component from a data field drop
function _createComponentFromField(field) {
  var type, props;
  switch (field.type) {
    case 'score':
      type = 'badge';
      props = { field: field.path, label: _fieldLabel(field.path), thresholds: '{"0.7":"danger","0.4":"warning","0":"success"}' };
      break;
    case 'number':
      type = 'data-display';
      props = { field: field.path, label: _fieldLabel(field.path), format: 'currency' };
      break;
    case 'longtext':
      type = 'data-display';
      props = { field: field.path, label: _fieldLabel(field.path), format: 'text' };
      break;
    case 'image':
      type = 'image';
      props = { field: field.path, alt: _fieldLabel(field.path) };
      break;
    case 'array':
    case 'object':
      type = 'json-viewer';
      props = { field: field.path };
      break;
    case 'boolean':
      type = 'data-display';
      props = { field: field.path, label: _fieldLabel(field.path), format: 'text' };
      break;
    default:
      type = 'data-display';
      props = { field: field.path, label: _fieldLabel(field.path), format: 'text' };
  }
  return { type: type, props: Object.assign({}, HITL_COMPONENTS[type].defaults, props) };
}

function _fieldLabel(path) {
  var last = path.split('.').pop();
  return last.replace(/[_-]/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function renderHitlCanvas() {
  var el = document.getElementById('hitlCanvas');
  if (!el) return;
  if (_hitlSchema.components.length === 0) {
    el.innerHTML = '<div class="hitl-canvas-empty">Drag components here to build your form</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < _hitlSchema.components.length; i++) {
    html += _renderCanvasItem(_hitlSchema.components[i], [i]);
  }
  el.innerHTML = html;
}

function _renderCanvasItem(c, path) {
  var def = HITL_COMPONENTS[c.type] || {};
  var pathStr = _hitlPathStr(path);
  var selected = _hitlPathEq(_hitlSelectedPath, path) ? ' selected' : '';
  var html = '<div class="hitl-canvas-component' + selected + '" data-path="' + pathStr + '" draggable="true" ';
  html += 'onclick="hitlSelectComponent(event,[' + path.join(',') + '])" ';
  html += 'ondragstart="hitlCanvasDragStart(event,[' + path.join(',') + '])" ';
  html += 'ondragover="hitlCanvasDragOver(event,[' + path.join(',') + '])" ';
  html += 'ondragleave="hitlCanvasDragLeave(event)" ';
  html += 'ondrop="hitlCanvasDrop(event,[' + path.join(',') + '])">';
  html += '<div class="hitl-component-header">';
  html += '<span class="hitl-component-type">' + (def.label || c.type) + '</span>';
  html += '<span class="hitl-component-delete" onclick="event.stopPropagation();hitlRemoveComponent([' + path.join(',') + '])" title="Remove"><i class="fa fa-times"></i></span>';
  html += '</div>';
  html += '<div class="hitl-component-preview">' + hitlPreviewComponent(c, path) + '</div>';
  html += '</div>';
  return html;
}

function hitlPreviewComponent(c, path) {
  var p = c.props || {};
  switch (c.type) {
    case 'heading': return '<strong>' + esc(p.text || 'Heading') + '</strong>';
    case 'text': return '<span style="color:var(--color-text-muted)">' + esc((p.text || '').substring(0, 80)) + '</span>';
    case 'data-display': return '<span style="color:var(--color-primary)">{{' + esc(p.field || '?') + '}}</span> — ' + esc(p.label || '');
    case 'json-viewer': return '<code>{{' + esc(p.field || '?') + '}} (JSON)</code>';
    case 'image': return '<span style="color:var(--color-text-muted)">Image: {{' + esc(p.field || '?') + '}}</span>';
    case 'badge': return '<span class="hitl-rendered-badge info">' + esc(p.label || p.field || 'badge') + '</span>';
    case 'divider': return '<hr style="margin:4px 0;border:0;border-top:1px solid var(--color-border-light)">';
    case 'spacer': return '<div style="height:' + (p.height || 20) + 'px"></div>';
    case 'text-input': return '<input type="text" class="form-input" disabled placeholder="' + esc(p.placeholder || p.label || '') + '" style="opacity:0.6">';
    case 'textarea': return '<textarea class="form-input" disabled placeholder="' + esc(p.placeholder || p.label || '') + '" style="opacity:0.6;height:40px"></textarea>';
    case 'select':
      var opts = (p.options || '').split(',').map(function(o) { return o.trim(); });
      return '<select class="form-input" disabled style="opacity:0.6"><option>' + esc(opts[0] || 'Select...') + '</option></select>';
    case 'checkbox': return '<label style="opacity:0.7"><input type="checkbox" disabled> ' + esc(p.label || 'Checkbox') + '</label>';
    case 'radio': return '<span style="opacity:0.7">' + (p.options || '').split(',').map(function(o) { return '<label style="margin-right:12px"><input type="radio" disabled> ' + esc(o.trim()) + '</label>'; }).join('') + '</span>';
    case 'number': return '<input type="number" class="form-input" disabled placeholder="' + esc(p.label || '0') + '" style="opacity:0.6;width:120px">';
    case 'columns':
      _hitlEnsureChildren(c);
      var count = p.count || 2;
      var colHtml = '<div class="hitl-builder-columns cols-' + count + '">';
      for (var ci = 0; ci < count; ci++) {
        var children = c.children[ci] || [];
        colHtml += '<div class="hitl-builder-column" ';
        colHtml += 'ondragover="hitlColumnDragOver(event,[' + path[0] + ',' + ci + '])" ';
        colHtml += 'ondragleave="hitlColumnDragLeave(event)" ';
        colHtml += 'ondrop="hitlColumnDrop(event,[' + path[0] + ',' + ci + '])">';
        if (children.length === 0) {
          colHtml += '<div class="hitl-column-empty">Drop here</div>';
        } else {
          for (var j = 0; j < children.length; j++) {
            colHtml += _renderCanvasItem(children[j], [path[0], ci, j]);
          }
        }
        colHtml += '</div>';
      }
      colHtml += '</div>';
      return colHtml;
    case 'section': return '<div style="border:1px solid var(--color-border-light);padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600;color:var(--color-text-muted)">' + esc(p.title || 'Section') + '</div>';
    case 'button-group':
      var btns = (p.buttons || '').split(',').map(function(b) {
        var parts = b.trim().split(':');
        var style = parts[2] || 'primary';
        return '<button class="btn btn-' + style + ' btn-sm" disabled>' + esc(parts[1] || parts[0]) + '</button>';
      });
      return '<div style="display:flex;gap:6px">' + btns.join('') + '</div>';
    default: return '<span style="color:var(--color-text-muted)">' + esc(c.type) + '</span>';
  }
}

function renderHitlProps() {
  var el = document.getElementById('hitlProps');
  if (!el) return;
  var c = _hitlGetByPath(_hitlSelectedPath);
  if (!c) {
    el.innerHTML = '<div class="hitl-props-empty">Select a component to edit its properties</div>';
    return;
  }
  var p = c.props || {};
  var def = HITL_COMPONENTS[c.type] || {};
  var html = '<div class="hitl-props-title">' + (def.label || c.type) + ' Properties</div>';

  var fields = hitlGetPropFields(c.type);
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var val = p[f.key] !== undefined ? p[f.key] : (f.default || '');
    html += '<div class="hitl-prop-group"><label>' + esc(f.label) + '</label>';
    if (f.type === 'text') {
      html += '<input type="text" value="' + esc(String(val)) + '" onchange="hitlUpdateProp(\'' + f.key + '\',this.value)">';
    } else if (f.type === 'number') {
      html += '<input type="number" value="' + esc(String(val)) + '" onchange="hitlUpdateProp(\'' + f.key + '\',parseInt(this.value)||0)">';
    } else if (f.type === 'textarea') {
      html += '<textarea onchange="hitlUpdateProp(\'' + f.key + '\',this.value)">' + esc(String(val)) + '</textarea>';
    } else if (f.type === 'select') {
      html += '<select onchange="hitlUpdateProp(\'' + f.key + '\',this.value)">';
      for (var j = 0; j < f.options.length; j++) {
        var opt = f.options[j];
        var optVal = typeof opt === 'object' ? opt.value : opt;
        var optLabel = typeof opt === 'object' ? opt.label : opt;
        html += '<option value="' + esc(optVal) + '"' + (String(val) === String(optVal) ? ' selected' : '') + '>' + esc(optLabel) + '</option>';
      }
      html += '</select>';
    } else if (f.type === 'boolean') {
      html += '<select onchange="hitlUpdateProp(\'' + f.key + '\',this.value===\'true\')">';
      html += '<option value="false"' + (!val ? ' selected' : '') + '>No</option>';
      html += '<option value="true"' + (val ? ' selected' : '') + '>Yes</option></select>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function hitlGetPropFields(type) {
  switch (type) {
    case 'heading': return [{ key: 'text', label: 'Text', type: 'text' }, { key: 'level', label: 'Level', type: 'select', options: [{value:2,label:'H2'},{value:3,label:'H3'},{value:4,label:'H4'}] }];
    case 'text': return [{ key: 'text', label: 'Content', type: 'textarea' }, { key: 'format', label: 'Format', type: 'select', options: ['plain','markdown'] }];
    case 'data-display': return [{ key: 'field', label: 'Data Field ({{field}})', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'format', label: 'Format', type: 'select', options: ['text','markdown','currency','date'] }];
    case 'json-viewer': return [{ key: 'field', label: 'Data Field', type: 'text' }];
    case 'image': return [{ key: 'field', label: 'URL Field', type: 'text' }, { key: 'alt', label: 'Alt Text', type: 'text' }];
    case 'badge': return [{ key: 'field', label: 'Data Field', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'thresholds', label: 'Thresholds (JSON)', type: 'textarea' }];
    case 'divider': return [];
    case 'spacer': return [{ key: 'height', label: 'Height (px)', type: 'number' }];
    case 'text-input': return [{ key: 'name', label: 'Field Name', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'placeholder', label: 'Placeholder', type: 'text' }, { key: 'required', label: 'Required', type: 'boolean' }];
    case 'textarea': return [{ key: 'name', label: 'Field Name', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'placeholder', label: 'Placeholder', type: 'text' }, { key: 'required', label: 'Required', type: 'boolean' }];
    case 'select': return [{ key: 'name', label: 'Field Name', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'options', label: 'Options (comma-separated)', type: 'textarea' }, { key: 'required', label: 'Required', type: 'boolean' }];
    case 'checkbox': return [{ key: 'name', label: 'Field Name', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }];
    case 'radio': return [{ key: 'name', label: 'Field Name', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'options', label: 'Options (comma-separated)', type: 'textarea' }];
    case 'number': return [{ key: 'name', label: 'Field Name', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'min', label: 'Min', type: 'text' }, { key: 'max', label: 'Max', type: 'text' }, { key: 'required', label: 'Required', type: 'boolean' }];
    case 'columns': return [{ key: 'count', label: 'Column Count', type: 'select', options: [{value:2,label:'2 Columns'},{value:3,label:'3 Columns'}] }];
    case 'section': return [{ key: 'title', label: 'Title', type: 'text' }, { key: 'collapsible', label: 'Collapsible', type: 'boolean' }];
    case 'button-group': return [{ key: 'buttons', label: 'Buttons (action:label:style,...)', type: 'textarea' }];
    default: return [];
  }
}

// --- Drag & Drop ---

// Root canvas handlers — only highlight when NOT over a column zone
function hitlRootDragOver(e) {
  e.preventDefault();
  // Only show root drag-over highlight if dragging over the canvas itself, not a column
  if (!e.target.closest('.hitl-builder-column')) {
    document.getElementById('hitlCanvas').classList.add('drag-over');
  }
}
function hitlRootDragLeave(e) {
  document.getElementById('hitlCanvas').classList.remove('drag-over');
}

function hitlPaletteDragStart(e, type) {
  _hitlDragType = type;
  _hitlDragSource = null;
  e.dataTransfer.setData('text/plain', type);
  e.dataTransfer.effectAllowed = 'copy';
}

function hitlCanvasDragStart(e, path) {
  e.stopPropagation();
  _hitlDragType = null;
  _hitlDragSource = { path: path };
  e.dataTransfer.setData('text/plain', 'move');
  e.dataTransfer.effectAllowed = 'move';
}

function hitlCanvasDragOver(e, path) {
  e.preventDefault();
  e.stopPropagation();
  // If hovering over a column zone inside this component, don't show above/below indicators
  if (e.target.closest('.hitl-builder-column') && path.length === 1) return;
  e.dataTransfer.dropEffect = (_hitlDragType || _hitlDragField) ? 'copy' : 'move';
  var el = e.currentTarget;
  var rect = el.getBoundingClientRect();
  var mid = rect.top + rect.height / 2;
  el.classList.remove('drag-over-above', 'drag-over-below');
  el.classList.add(e.clientY < mid ? 'drag-over-above' : 'drag-over-below');
}

function hitlCanvasDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-above', 'drag-over-below');
}

// Drop on root canvas (empty area) — ignore if drop target is inside a column
function hitlCanvasDropZone(e) {
  e.preventDefault();
  var canvas = document.getElementById('hitlCanvas');
  if (canvas) canvas.classList.remove('drag-over');
  // If the drop landed on a column zone, let the column handler deal with it
  if (e.target.closest('.hitl-builder-column')) return;
  if (_hitlDragField) {
    var comp = _createComponentFromField(_hitlDragField);
    _hitlSchema.components.push(comp);
    _hitlSelectedPath = [_hitlSchema.components.length - 1];
  } else if (_hitlDragType) {
    var comp = _createNewComponent(_hitlDragType);
    _hitlSchema.components.push(comp);
    _hitlSelectedPath = [_hitlSchema.components.length - 1];
  } else if (_hitlDragSource) {
    // Move to end of root
    var moved = _hitlRemoveByPath(_hitlDragSource.path);
    if (moved) {
      _hitlSchema.components.push(moved);
      _hitlSelectedPath = [_hitlSchema.components.length - 1];
    }
  }
  _hitlDragType = null;
  _hitlDragSource = null;
  _hitlDragField = null;
  renderHitlCanvas();
  renderHitlProps();
}

// Drop on a canvas component (reorder at same level)
function hitlCanvasDrop(e, targetPath) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over-above', 'drag-over-below');
  // If drop landed inside a column zone (not on a child component), let column handler deal with it
  if (e.target.closest('.hitl-builder-column') && !e.target.closest('.hitl-builder-column .hitl-canvas-component')) return;

  var rect = e.currentTarget.getBoundingClientRect();
  var insertAfter = e.clientY >= rect.top + rect.height / 2;

  var targetList = _hitlGetListByPath(targetPath);
  if (!targetList) { _hitlDragType = null; _hitlDragSource = null; return; }
  var targetIdx = targetPath[targetPath.length - 1];
  var insertIdx = insertAfter ? targetIdx + 1 : targetIdx;

  if (_hitlDragField) {
    var comp = _createComponentFromField(_hitlDragField);
    targetList.splice(insertIdx, 0, comp);
    var newPath = targetPath.slice(0, -1);
    newPath.push(insertIdx);
    _hitlSelectedPath = newPath;
  } else if (_hitlDragType) {
    // Don't allow nesting columns inside columns
    if (_hitlDragType === 'columns' && targetPath.length > 1) {
      _hitlDragType = null; _hitlDragSource = null; _hitlDragField = null; return;
    }
    var comp = _createNewComponent(_hitlDragType);
    targetList.splice(insertIdx, 0, comp);
    var newPath = targetPath.slice(0, -1);
    newPath.push(insertIdx);
    _hitlSelectedPath = newPath;
  } else if (_hitlDragSource) {
    var srcPath = _hitlDragSource.path;
    // Don't allow dropping columns inside columns
    var srcComp = _hitlGetByPath(srcPath);
    if (srcComp && srcComp.type === 'columns' && targetPath.length > 1) {
      _hitlDragType = null; _hitlDragSource = null; return;
    }
    // Same list reorder
    var sameLevelDrop = srcPath.length === targetPath.length &&
      srcPath.slice(0, -1).join(',') === targetPath.slice(0, -1).join(',');
    if (sameLevelDrop) {
      var srcIdx = srcPath[srcPath.length - 1];
      if (srcIdx === targetIdx) { _hitlDragType = null; _hitlDragSource = null; return; }
      var moved = targetList.splice(srcIdx, 1)[0];
      var newIdx = srcIdx < insertIdx ? insertIdx - 1 : insertIdx;
      targetList.splice(newIdx, 0, moved);
      var np = targetPath.slice(0, -1);
      np.push(newIdx);
      _hitlSelectedPath = np;
    } else {
      // Cross-list move (e.g., root to column, column to root, column to column)
      var moved = _hitlRemoveByPath(srcPath);
      if (moved) {
        // Re-resolve target list since indices may have shifted
        var tl = _hitlGetListByPath(targetPath);
        if (tl) {
          // Adjust insertIdx if same parent and source was before target
          var adjustedIdx = insertIdx;
          if (srcPath.length === targetPath.length &&
            srcPath.slice(0, -1).join(',') === targetPath.slice(0, -1).join(',') &&
            srcPath[srcPath.length - 1] < targetIdx) {
            adjustedIdx = insertIdx - 1;
          }
          tl.splice(adjustedIdx, 0, moved);
          var rp = targetPath.slice(0, -1);
          rp.push(adjustedIdx);
          _hitlSelectedPath = rp;
        }
      }
    }
  }

  _hitlDragType = null;
  _hitlDragSource = null;
  _hitlDragField = null;
  renderHitlCanvas();
  renderHitlProps();
}

// Column-specific drag/drop handlers
function hitlColumnDragOver(e, colRef) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = (_hitlDragType || _hitlDragField) ? 'copy' : 'move';
  e.currentTarget.classList.add('drag-over');
}

function hitlColumnDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function hitlColumnDrop(e, colRef) {
  // colRef = [rootIdx, colIdx]
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');

  var parent = _hitlSchema.components[colRef[0]];
  if (!parent || !parent.children) { _hitlDragType = null; _hitlDragSource = null; _hitlDragField = null; return; }
  var colChildren = parent.children[colRef[1]];
  if (!colChildren) { _hitlDragType = null; _hitlDragSource = null; _hitlDragField = null; return; }

  if (_hitlDragField) {
    var comp = _createComponentFromField(_hitlDragField);
    colChildren.push(comp);
    _hitlSelectedPath = [colRef[0], colRef[1], colChildren.length - 1];
  } else if (_hitlDragType) {
    // Don't allow nesting columns inside columns
    if (_hitlDragType === 'columns') { _hitlDragType = null; _hitlDragSource = null; _hitlDragField = null; return; }
    var comp = _createNewComponent(_hitlDragType);
    colChildren.push(comp);
    _hitlSelectedPath = [colRef[0], colRef[1], colChildren.length - 1];
  } else if (_hitlDragSource) {
    var srcComp = _hitlGetByPath(_hitlDragSource.path);
    if (srcComp && srcComp.type === 'columns') { _hitlDragType = null; _hitlDragSource = null; _hitlDragField = null; return; }
    var moved = _hitlRemoveByPath(_hitlDragSource.path);
    if (moved) {
      // Re-resolve after removal
      var p = _hitlSchema.components[colRef[0]];
      if (p && p.children && p.children[colRef[1]]) {
        p.children[colRef[1]].push(moved);
        _hitlSelectedPath = [colRef[0], colRef[1], p.children[colRef[1]].length - 1];
      }
    }
  }

  _hitlDragType = null;
  _hitlDragSource = null;
  _hitlDragField = null;
  renderHitlCanvas();
  renderHitlProps();
}

function _createNewComponent(type) {
  var comp = { type: type, props: Object.assign({}, HITL_COMPONENTS[type].defaults) };
  if (type === 'columns') {
    _hitlEnsureChildren(comp);
  }
  return comp;
}

// --- Component operations ---
function hitlSelectComponent(e, path) {
  e.stopPropagation();
  _hitlSelectedPath = path;
  renderHitlCanvas();
  renderHitlProps();
}

function hitlRemoveComponent(path) {
  _hitlRemoveByPath(path);
  _hitlSelectedPath = null;
  renderHitlCanvas();
  renderHitlProps();
}

function hitlUpdateProp(key, value) {
  var c = _hitlGetByPath(_hitlSelectedPath);
  if (!c) return;
  if (!c.props) c.props = {};
  c.props[key] = value;
  // If changing column count, re-sync children arrays
  if (c.type === 'columns' && key === 'count') {
    _hitlEnsureChildren(c);
  }
  renderHitlCanvas();
}

// --- Template CRUD ---
async function loadHitlTemplates() {
  try {
    var res = await fetch(API + '/api/hitl/templates');
    if (!res.ok) return;
    var data = await res.json();
    _hitlTemplates = data.templates || [];
    renderHitlTemplateList();
  } catch (e) { console.error('Load HITL templates error:', e); }
}

function renderHitlTemplateList() {
  var el = document.getElementById('hitlTemplateList');
  if (!el) return;
  if (_hitlTemplates.length === 0) {
    el.innerHTML = '<div class="kb-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg><h3>No form templates yet</h3><p>Create your first approval form template to get started.</p></div>';
    return;
  }
  var html = '<div class="users-card"><table class="tickets-table hitl-tpl-table">';
  html += '<thead><tr><th style="width:50px">Active</th><th>Template</th><th>Slug</th><th>Requests</th><th>Status</th><th>Updated</th><th style="width:100px">Actions</th></tr></thead><tbody>';
  for (var t of _hitlTemplates) {
    var active = t.is_active !== false;
    var reqCount = t.request_count || 0;
    var pendCount = t.pending_count || 0;
    html += '<tr class="' + (active ? '' : 'hitl-row-inactive') + '">';
    html += '<td><label class="hitl-toggle" title="' + (active ? 'Active — webhook enabled' : 'Inactive — webhook disabled') + '">';
    html += '<input type="checkbox"' + (active ? ' checked' : '') + ' onchange="toggleHitlTemplate(' + t.id + ')">';
    html += '<span class="hitl-toggle-slider"></span></label></td>';
    html += '<td><div class="hitl-tpl-name">' + esc(t.name) + '</div>';
    if (t.description) html += '<div class="hitl-tpl-desc">' + esc(t.description) + '</div>';
    html += '</td>';
    html += '<td><code class="hitl-tpl-slug">' + esc(t.slug) + '</code></td>';
    html += '<td class="ticket-meta">' + reqCount + (pendCount > 0 ? ' <span class="ticket-badge badge-open" style="font-size:10px">' + pendCount + ' pending</span>' : '') + '</td>';
    html += '<td><span class="ticket-badge ' + (active ? 'badge-resolved' : 'badge-closed') + '">' + (active ? 'active' : 'inactive') + '</span></td>';
    html += '<td class="ticket-meta">' + timeAgo(t.updated_at) + '</td>';
    html += '<td><div style="display:flex;gap:4px">';
    html += '<button class="btn btn-secondary btn-sm" onclick="editHitlTemplate(' + t.id + ')" title="Edit"><i class="fa fa-pencil"></i></button>';
    html += '<button class="btn btn-danger btn-sm" onclick="deleteHitlTemplate(' + t.id + ')" title="Delete"><i class="fa fa-trash"></i></button>';
    html += '</div></td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  html += '<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">' + _hitlTemplates.length + ' template' + (_hitlTemplates.length !== 1 ? 's' : '') + '</div>';
  el.innerHTML = html;
}

function openHitlBuilder(templateData) {
  _hitlEditingTemplateId = templateData ? templateData.id : null;
  _hitlSchema = templateData && templateData.schema ? JSON.parse(JSON.stringify(templateData.schema)) : { components: [] };
  _hitlSelectedPath = null;

  // Ensure existing columns components have children arrays
  for (var i = 0; i < _hitlSchema.components.length; i++) {
    if (_hitlSchema.components[i].type === 'columns') {
      _hitlEnsureChildren(_hitlSchema.components[i]);
    }
  }

  document.getElementById('hitlBuilderName').value = templateData ? templateData.name : '';
  document.getElementById('hitlBuilderSlug').value = templateData ? templateData.slug : '';
  document.getElementById('hitlBuilderDesc').value = templateData ? (templateData.description || '') : '';

  document.getElementById('hitlTemplateListWrap').style.display = 'none';
  document.getElementById('hitlBuilderWrap').style.display = '';
  _hitlPreviewVisible = false;
  var pw = document.getElementById('hitlPreviewWrap');
  var bg = document.getElementById('hitlBuilderGrid');
  var pb = document.getElementById('hitlPreviewBtn');
  if (pw) pw.style.display = 'none';
  if (bg) bg.style.display = '';
  if (pb) pb.innerHTML = '<i class="fa fa-eye"></i> Preview';
  initHitlBuilder();
  hitlUpdateWebhookUrls();
}

function closeHitlBuilder() {
  hitlStopCapture();
  document.getElementById('hitlBuilderWrap').style.display = 'none';
  document.getElementById('hitlTemplateListWrap').style.display = '';
  loadHitlTemplates();
}

async function editHitlTemplate(id) {
  try {
    var res = await fetch(API + '/api/hitl/templates/' + id);
    if (!res.ok) { toast('Failed to load template', 'error'); return; }
    var data = await res.json();
    openHitlBuilder(data);
  } catch (e) { toast('Failed to load template', 'error'); }
}

async function toggleHitlTemplate(id) {
  try {
    var res = await fetch(API + '/api/hitl/templates/' + id + '/toggle', { method: 'PATCH', headers: CSRF_HEADERS });
    if (!res.ok) { toast('Failed to toggle', 'error'); return; }
    var data = await res.json();
    // Update local cache
    for (var i = 0; i < _hitlTemplates.length; i++) {
      if (_hitlTemplates[i].id === id) { _hitlTemplates[i].is_active = data.is_active; break; }
    }
    renderHitlTemplateList();
    toast(data.is_active ? 'Template activated' : 'Template deactivated', 'success');
  } catch (e) { toast('Failed to toggle', 'error'); }
}

async function deleteHitlTemplate(id) {
  var ok = await appConfirm('Delete this form template?', { danger: true, okLabel: 'Delete' });
  if (!ok) return;
  try {
    await fetch(API + '/api/hitl/templates/' + id, { method: 'DELETE', headers: CSRF_HEADERS });
    toast('Template deleted', 'success');
    loadHitlTemplates();
  } catch (e) { toast('Failed to delete', 'error'); }
}

async function saveHitlTemplate() {
  var name = document.getElementById('hitlBuilderName').value.trim();
  var slug = document.getElementById('hitlBuilderSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  var desc = document.getElementById('hitlBuilderDesc').value.trim();
  if (!name || !slug) { toast('Name and slug are required', 'error'); return; }
  if (_hitlSchema.components.length === 0) { toast('Add at least one component', 'error'); return; }

  var body = { name: name, slug: slug, description: desc, schema: _hitlSchema };
  var method = _hitlEditingTemplateId ? 'PUT' : 'POST';
  var url = _hitlEditingTemplateId ? API + '/api/hitl/templates/' + _hitlEditingTemplateId : API + '/api/hitl/templates';

  try {
    var res = await fetch(url, { method: method, headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) { var err = await res.json(); toast(err.error || 'Failed to save', 'error'); return; }
    toast('Template saved', 'success');
    closeHitlBuilder();
  } catch (e) { toast('Failed to save template', 'error'); }
}

// Auto-generate slug from name
function hitlAutoSlug() {
  var name = document.getElementById('hitlBuilderName').value;
  var slugEl = document.getElementById('hitlBuilderSlug');
  if (!_hitlEditingTemplateId && slugEl) {
    slugEl.value = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  hitlUpdateWebhookUrls();
}

function hitlUpdateWebhookUrls() {
  var slug = (document.getElementById('hitlBuilderSlug').value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  var el = document.getElementById('hitlWebhookUrls');
  if (!el) return;
  if (!slug) { el.style.display = 'none'; return; }

  var base = window.location.origin;
  var prodUrl = base + '/api/hitl/webhook/' + slug;
  var testUrl = base + '/api/hitl/webhook/test/' + slug;

  el.style.display = '';
  el.innerHTML =
    '<div class="hitl-webhook-label"><i class="fa fa-link"></i> Webhook URLs <span class="hitl-webhook-hint">(requires API key: <code>Authorization: Bearer n8nlib_xxx</code>)</span></div>' +
    '<div class="hitl-webhook-row">' +
      '<span class="hitl-webhook-tag prod">PROD</span>' +
      '<input type="text" class="form-input" value="' + esc(prodUrl) + '" readonly onclick="this.select()" style="font-size:11px;font-family:monospace;flex:1">' +
      '<button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\'' + esc(prodUrl) + '\');toast(\'Copied!\',\'success\')" title="Copy URL"><i class="fa fa-copy"></i></button>' +
      '<button class="btn btn-secondary btn-sm" onclick="hitlCopyCurl(\'prod\')" title="Copy cURL command"><i class="fa fa-terminal"></i> cURL</button>' +
    '</div>' +
    '<div class="hitl-webhook-row">' +
      '<span class="hitl-webhook-tag test">TEST</span>' +
      '<input type="text" class="form-input" value="' + esc(testUrl) + '" readonly onclick="this.select()" style="font-size:11px;font-family:monospace;flex:1">' +
      '<button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\'' + esc(testUrl) + '\');toast(\'Copied!\',\'success\')" title="Copy URL"><i class="fa fa-copy"></i></button>' +
      '<button class="btn btn-secondary btn-sm" onclick="hitlCopyCurl(\'test\')" title="Copy cURL command"><i class="fa fa-terminal"></i> cURL</button>' +
    '</div>';
}

function _hitlCollectDataFields(components) {
  var fields = {};
  for (var i = 0; i < components.length; i++) {
    var c = components[i];
    var p = c.props || {};
    var type = c.type;

    // Display components that reference data fields
    if (p.field && ['data-display', 'json-viewer', 'image', 'badge'].indexOf(type) !== -1) {
      var key = p.field;
      if (!fields[key]) {
        if (type === 'badge') fields[key] = 0.5;
        else if (type === 'image') fields[key] = 'https://example.com/image.png';
        else if (type === 'json-viewer') fields[key] = { example: 'value' };
        else fields[key] = 'Sample ' + (p.label || key);
      }
    }

    // Input components — these are form fields the reviewer fills in, not data
    // but we include them so the user sees the full picture

    // Recurse into columns children
    if (type === 'columns' && c.children) {
      for (var ci = 0; ci < c.children.length; ci++) {
        var colFields = _hitlCollectDataFields(c.children[ci] || []);
        for (var k in colFields) { if (!fields[k]) fields[k] = colFields[k]; }
      }
    }
    // Recurse into section children
    if (type === 'section' && c.children) {
      var secFields = _hitlCollectDataFields(c.children[0] || []);
      for (var k2 in secFields) { if (!fields[k2]) fields[k2] = secFields[k2]; }
    }
  }
  return fields;
}

function hitlCopyCurl(mode) {
  var slug = (document.getElementById('hitlBuilderSlug').value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!slug) return;

  var base = window.location.origin;
  var url = mode === 'test'
    ? base + '/api/hitl/webhook/test/' + slug
    : base + '/api/hitl/webhook/' + slug;

  // Build data from schema fields — use sample data values if available, otherwise generate placeholders
  var schemaFields = _hitlCollectDataFields(_hitlSchema.components || []);
  var sampleData = {};
  try { sampleData = JSON.parse(_hitlSampleDataStr); } catch (e) {}

  // Merge: use sample data values for fields that exist in schema, add schema placeholders for the rest
  var data = {};
  for (var key in schemaFields) {
    data[key] = (sampleData[key] !== undefined) ? sampleData[key] : schemaFields[key];
  }
  // If no fields found from schema, fall back to sample data
  if (Object.keys(data).length === 0) data = sampleData;

  var templateName = document.getElementById('hitlBuilderName').value.trim() || slug;
  var payload;

  if (mode === 'test') {
    // Test curl — just send data to validate the template
    payload = { data: data };
  } else {
    // Production curl — full HITL request with callback
    payload = {
      callback_url: 'https://YOUR_N8N_INSTANCE/webhook-waiting/EXECUTION_ID',
      title: templateName,
      description: 'Approval request from n8n workflow',
      priority: 'medium',
      timeout_minutes: 1440,
      data: data
    };
  }

  var jsonStr = JSON.stringify(payload, null, 2);
  var escaped = jsonStr.replace(/'/g, "'\\''");

  var curl = "curl -X POST '" + url + "' \\\n" +
    "  -H 'Content-Type: application/json' \\\n" +
    "  -H 'Authorization: Bearer n8nlib_YOUR_API_KEY' \\\n" +
    "  -d '" + escaped + "'";

  navigator.clipboard.writeText(curl);
  toast(mode === 'test' ? 'Test cURL copied!' : 'Production cURL copied!', 'success');
}

// --- Form Preview ---
var _hitlPreviewVisible = false;

function hitlTogglePreview() {
  _hitlPreviewVisible = !_hitlPreviewVisible;
  var previewWrap = document.getElementById('hitlPreviewWrap');
  var builderGrid = document.getElementById('hitlBuilderGrid');
  var btn = document.getElementById('hitlPreviewBtn');
  if (_hitlPreviewVisible) {
    previewWrap.style.display = '';
    builderGrid.style.display = 'none';
    if (btn) btn.innerHTML = '<i class="fa fa-pencil"></i> Builder';
    // Sync sample data to preview textarea
    var previewInput = document.getElementById('hitlPreviewData');
    if (previewInput) previewInput.value = _hitlSampleDataStr;
    hitlRefreshPreview();
  } else {
    previewWrap.style.display = 'none';
    builderGrid.style.display = '';
    if (btn) btn.innerHTML = '<i class="fa fa-eye"></i> Preview';
    // Sync preview textarea back to shared state
    var previewInput = document.getElementById('hitlPreviewData');
    if (previewInput) {
      try { _hitlSampleData = JSON.parse(previewInput.value); _hitlSampleDataStr = previewInput.value; } catch(e) {}
    }
    // Re-render palette data fields in case data changed
    var listEl = document.getElementById('hitlDataFieldsList');
    if (listEl) listEl.innerHTML = _renderDataFields();
  }
}

function hitlRefreshPreview() {
  var output = document.getElementById('hitlPreviewOutput');
  if (!output) return;

  var dataStr = document.getElementById('hitlPreviewData').value.trim();
  var sampleData = {};
  try {
    sampleData = JSON.parse(dataStr);
    _hitlSampleData = sampleData;
    _hitlSampleDataStr = dataStr;
  } catch (e) {
    output.innerHTML = '<div style="color:var(--color-danger);font-size:13px"><i class="fa fa-exclamation-triangle"></i> Invalid JSON in sample data: ' + esc(e.message) + '</div>';
    return;
  }

  if (_hitlSchema.components.length === 0) {
    output.innerHTML = '<div style="color:var(--color-text-muted);text-align:center;padding:40px">No components yet. Add some in the builder first.</div>';
    return;
  }

  var html = renderHitlForm(_hitlSchema, sampleData, 0, true);
  output.innerHTML = html;
}

// --- Approvals Panel ---
var _hitlSse = null;

async function loadHitlRequests(status) {
  status = status || 'pending';
  var container = document.getElementById('hitlRequestsList');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading...</div>';

  try {
    var res = await fetch(API + '/api/hitl/requests?status=' + status);
    if (!res.ok) { container.innerHTML = '<p style="color:var(--color-text-muted)">Failed to load</p>'; return; }
    var data = await res.json();

    if (!data.requests || data.requests.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:40px"><p>No ' + status + ' requests</p></div>';
      return;
    }

    var html = '';
    for (var r of data.requests) {
      html += renderHitlRequestCard(r, status === 'pending');
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:var(--color-text-muted)">Error loading requests</p>';
  }
}

function renderHitlRequestCard(r, showActions) {
  var ago = timeAgo(r.created_at);
  var html = '<div class="hitl-request-card" id="hitl-req-' + r.id + '">';
  html += '<div class="hitl-request-header" onclick="toggleHitlRequest(' + r.id + ')">';
  html += '<div class="hitl-request-priority ' + (r.priority || 'medium') + '"></div>';
  html += '<div class="hitl-request-title">' + esc(r.title) + '</div>';
  html += '<span class="hitl-request-status ' + r.status + '">' + r.status + '</span>';
  html += '<span class="hitl-request-time">' + ago + '</span>';
  html += '</div>';
  html += '<div class="hitl-request-body" id="hitl-req-body-' + r.id + '" style="display:none">';

  if (r.description) {
    html += '<p style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">' + esc(r.description) + '</p>';
  }

  if (r.template_schema && r.data) {
    html += renderHitlForm(r.template_schema, r.data, r.id, showActions);
  } else {
    if (r.data && Object.keys(r.data).length > 0) {
      html += '<div class="hitl-rendered-json">' + esc(JSON.stringify(r.data, null, 2)) + '</div>';
    }
    if (showActions) {
      html += '<div class="hitl-action-buttons">';
      html += '<button class="btn btn-success" onclick="submitHitlResponse(' + r.id + ',\'approve\')">Approve</button>';
      html += '<button class="btn btn-danger" onclick="submitHitlResponse(' + r.id + ',\'reject\')">Reject</button>';
      html += '</div>';
    }
  }

  if (r.status !== 'pending' && r.responded_by_name) {
    html += '<div style="font-size:12px;color:var(--color-text-muted);margin-top:12px;padding-top:8px;border-top:1px solid var(--color-border-light)">';
    html += r.status + ' by <strong>' + esc(r.responded_by_name) + '</strong>';
    if (r.responded_at) html += ' on ' + new Date(r.responded_at).toLocaleString();
    if (r.response_comment) html += '<br><em>' + esc(r.response_comment) + '</em>';
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

function toggleHitlRequest(id) {
  var body = document.getElementById('hitl-req-body-' + id);
  if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
}

// --- Form Renderer ---
function renderHitlForm(schema, data, requestId, showActions) {
  var components = schema.components || [];
  var html = '';
  for (var c of components) {
    html += renderHitlFormComponent(c, data, requestId, showActions);
  }
  return html;
}

function resolveTemplate(text, data) {
  if (!text) return '';
  return String(text).replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, function(match, key) {
    var val = data;
    var parts = key.split('.');
    for (var p of parts) {
      if (val && typeof val === 'object') val = val[p];
      else return match;
    }
    return val !== undefined && val !== null ? String(val) : match;
  });
}

function renderHitlFormComponent(c, data, requestId, showActions) {
  var p = c.props || {};
  var html = '';

  switch (c.type) {
    case 'heading':
      var lvl = p.level || 3;
      html += '<h' + lvl + ' class="hitl-rendered-heading">' + esc(resolveTemplate(p.text, data)) + '</h' + lvl + '>';
      break;
    case 'text':
      var text = resolveTemplate(p.text || '', data);
      html += '<div style="font-size:13px;margin-bottom:10px">' + (p.format === 'markdown' ? md(text) : esc(text)) + '</div>';
      break;
    case 'data-display':
      var val = getNestedVal(data, p.field);
      if (val !== undefined) {
        html += '<div class="hitl-rendered-data"><div class="hitl-rendered-data-label">' + esc(p.label || p.field) + '</div>';
        if (p.format === 'currency') html += '<div style="font-size:16px;font-weight:600">$' + esc(Number(val).toLocaleString()) + '</div>';
        else if (p.format === 'markdown') html += '<div>' + md(String(val)) + '</div>';
        else html += '<div>' + esc(String(val)) + '</div>';
        html += '</div>';
      }
      break;
    case 'json-viewer':
      var jVal = getNestedVal(data, p.field);
      if (jVal !== undefined) {
        html += '<div class="hitl-rendered-json">' + esc(typeof jVal === 'object' ? JSON.stringify(jVal, null, 2) : String(jVal)) + '</div>';
      }
      break;
    case 'image':
      var imgUrl = getNestedVal(data, p.field);
      if (imgUrl) html += '<img src="' + esc(imgUrl) + '" alt="' + esc(p.alt || '') + '" style="max-width:100%;border-radius:var(--radius);margin-bottom:10px">';
      break;
    case 'badge':
      var bVal = getNestedVal(data, p.field);
      if (bVal !== undefined) {
        var bStyle = 'info';
        try {
          var thresholds = typeof p.thresholds === 'string' ? JSON.parse(p.thresholds) : (p.thresholds || {});
          var numVal = parseFloat(bVal);
          var sortedKeys = Object.keys(thresholds).sort(function(a, b) { return parseFloat(b) - parseFloat(a); });
          for (var k of sortedKeys) {
            if (numVal >= parseFloat(k)) { bStyle = thresholds[k]; break; }
          }
        } catch (e) {}
        html += '<div style="margin-bottom:10px"><span class="hitl-rendered-badge ' + bStyle + '">' + esc(p.label ? p.label + ': ' : '') + esc(String(bVal)) + '</span></div>';
      }
      break;
    case 'divider':
      html += '<hr class="hitl-rendered-divider">';
      break;
    case 'spacer':
      html += '<div style="height:' + (p.height || 20) + 'px"></div>';
      break;
    case 'text-input':
      if (showActions) {
        html += '<div class="form-group" style="margin-bottom:10px"><label>' + esc(p.label || '') + (p.required ? ' <span style="color:var(--color-danger)">*</span>' : '') + '</label>';
        html += '<input type="text" class="form-input hitl-form-field" data-name="' + esc(p.name || '') + '" placeholder="' + esc(p.placeholder || '') + '"' + (p.required ? ' required' : '') + '></div>';
      }
      break;
    case 'textarea':
      if (showActions) {
        html += '<div class="form-group" style="margin-bottom:10px"><label>' + esc(p.label || '') + (p.required ? ' <span style="color:var(--color-danger)">*</span>' : '') + '</label>';
        html += '<textarea class="form-input hitl-form-field" data-name="' + esc(p.name || '') + '" placeholder="' + esc(p.placeholder || '') + '" rows="3"' + (p.required ? ' required' : '') + '></textarea></div>';
      }
      break;
    case 'select':
      if (showActions) {
        var opts = (p.options || '').split(',').map(function(o) { return o.trim(); });
        html += '<div class="form-group" style="margin-bottom:10px"><label>' + esc(p.label || '') + (p.required ? ' <span style="color:var(--color-danger)">*</span>' : '') + '</label>';
        html += '<select class="form-input hitl-form-field" data-name="' + esc(p.name || '') + '">';
        html += '<option value="">Select...</option>';
        for (var o of opts) html += '<option value="' + esc(o) + '">' + esc(o) + '</option>';
        html += '</select></div>';
      }
      break;
    case 'checkbox':
      if (showActions) {
        html += '<div style="margin-bottom:10px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" class="hitl-form-field" data-name="' + esc(p.name || '') + '"> ' + esc(p.label || '') + '</label></div>';
      }
      break;
    case 'radio':
      if (showActions) {
        var rOpts = (p.options || '').split(',').map(function(o) { return o.trim(); });
        html += '<div class="form-group" style="margin-bottom:10px"><label>' + esc(p.label || '') + '</label><div>';
        for (var ro of rOpts) {
          html += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:13px"><input type="radio" class="hitl-form-field" name="hitl_' + requestId + '_' + esc(p.name || '') + '" data-name="' + esc(p.name || '') + '" value="' + esc(ro) + '"> ' + esc(ro) + '</label>';
        }
        html += '</div></div>';
      }
      break;
    case 'number':
      if (showActions) {
        html += '<div class="form-group" style="margin-bottom:10px"><label>' + esc(p.label || '') + (p.required ? ' <span style="color:var(--color-danger)">*</span>' : '') + '</label>';
        html += '<input type="number" class="form-input hitl-form-field" data-name="' + esc(p.name || '') + '"' + (p.min ? ' min="' + esc(p.min) + '"' : '') + (p.max ? ' max="' + esc(p.max) + '"' : '') + (p.required ? ' required' : '') + ' style="width:180px"></div>';
      }
      break;
    case 'columns':
      var colCount = p.count || 2;
      var children = c.children || [];
      html += '<div class="hitl-rendered-columns cols-' + colCount + '">';
      for (var ci = 0; ci < colCount; ci++) {
        html += '<div>';
        var colChildren = children[ci] || [];
        for (var ch of colChildren) {
          html += renderHitlFormComponent(ch, data, requestId, showActions);
        }
        html += '</div>';
      }
      html += '</div>';
      break;
    case 'section':
      html += '<div style="border:1px solid var(--color-border-light);border-radius:var(--radius);padding:12px;margin-bottom:10px"><div style="font-weight:600;font-size:13px;margin-bottom:8px">' + esc(p.title || 'Section') + '</div></div>';
      break;
    case 'button-group':
      if (showActions) {
        var btns = (p.buttons || '').split(',');
        html += '<div class="hitl-action-buttons">';
        for (var b of btns) {
          var parts = b.trim().split(':');
          var action = parts[0] || 'approve';
          var label = parts[1] || action;
          var style = parts[2] || 'primary';
          var confirm = action === 'reject' || style === 'danger' ? 'true' : 'false';
          html += '<button class="btn btn-' + style + '" onclick="submitHitlResponse(' + requestId + ',\'' + esc(action) + '\',' + confirm + ')">' + esc(label) + '</button>';
        }
        html += '</div>';
      }
      break;
  }
  return html;
}

function getNestedVal(obj, path) {
  if (!obj || !path) return undefined;
  var parts = path.split('.');
  var val = obj;
  for (var p of parts) {
    if (val && typeof val === 'object') val = val[p];
    else return undefined;
  }
  return val;
}

// --- Submit response ---
async function submitHitlResponse(requestId, action, needsConfirm) {
  if (needsConfirm) {
    var ok = await appConfirm('Are you sure you want to ' + action + ' this request?', {
      title: action.charAt(0).toUpperCase() + action.slice(1) + ' Request',
      danger: action === 'reject',
      okLabel: action.charAt(0).toUpperCase() + action.slice(1)
    });
    if (!ok) return;
  }

  var formData = {};
  var card = document.getElementById('hitl-req-' + requestId);
  if (card) {
    card.querySelectorAll('.hitl-form-field').forEach(function(field) {
      var name = field.getAttribute('data-name');
      if (!name) return;
      if (field.type === 'checkbox') formData[name] = field.checked;
      else if (field.type === 'radio') { if (field.checked) formData[name] = field.value; }
      else formData[name] = field.value;
    });
  }

  if (action !== 'reject') {
    var missing = false;
    if (card) {
      card.querySelectorAll('.hitl-form-field[required]').forEach(function(f) {
        if (!f.value) { f.style.borderColor = 'var(--color-danger)'; missing = true; }
        else f.style.borderColor = '';
      });
    }
    if (missing) { toast('Please fill in required fields', 'error'); return; }
  }

  try {
    var res = await fetch(API + '/api/hitl/requests/' + requestId + '/respond', {
      method: 'POST', headers: CSRF_HEADERS,
      body: JSON.stringify({ action: action, form_data: formData })
    });
    var data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed', 'error'); return; }
    toast('Request ' + action + 'd', 'success');
    loadHitlRequests(document.getElementById('hitlStatusFilter') ? document.getElementById('hitlStatusFilter').value : 'pending');
    loadHitlPendingCount();
  } catch (e) {
    toast('Failed to submit response', 'error');
  }
}

// --- SSE for real-time ---
function connectHitlSse() {
  if (_hitlSse) { _hitlSse.close(); _hitlSse = null; }
  _hitlSse = new EventSource(API + '/api/hitl/stream');
  _hitlSse.addEventListener('hitl', function(e) {
    try {
      var data = JSON.parse(e.data);
      if (data.type === 'new_request' || data.type === 'response') {
        var currentStatus = document.getElementById('hitlStatusFilter') ? document.getElementById('hitlStatusFilter').value : 'pending';
        loadHitlRequests(currentStatus);
        loadHitlPendingCount();
      }
    } catch (err) {}
  });
  _hitlSse.onerror = function() { _hitlSse.close(); setTimeout(connectHitlSse, 5000); };
}

function disconnectHitlSse() {
  if (_hitlSse) { _hitlSse.close(); _hitlSse = null; }
}

// --- Pending count badge ---
async function loadHitlPendingCount() {
  try {
    var res = await fetch(API + '/api/hitl/pending-count');
    if (!res.ok) return;
    var data = await res.json();
    var badge = document.getElementById('hitlNavBadge');
    var badgeMobile = document.getElementById('hitlNavBadgeMobile');
    if (badge) {
      badge.textContent = data.count;
      badge.style.display = data.count > 0 ? '' : 'none';
    }
    if (badgeMobile) {
      badgeMobile.textContent = data.count;
      badgeMobile.style.display = data.count > 0 ? '' : 'none';
    }
  } catch (e) {}
}

// --- timeAgo helper ---
function timeAgo(dateStr) {
  var now = Date.now();
  var then = new Date(dateStr).getTime();
  var diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}
