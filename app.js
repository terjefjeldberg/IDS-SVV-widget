(function () {
  "use strict";

  var SAMPLE_IDS = "./Test_trekkekum.ids";
  var IDS_NS = "http://standards.buildingsmart.org/IDS";
  var state = {
    streamBim: {
      connected: false,
      api: null,
      methods: [],
    },
    idsText: "",
    idsName: "",
    validation: null,
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    bindEvents();
    connectToStreamBim();
  }

  function bindElements() {
    els.connectionStatus = byId("connection-status");
    els.connectionDetail = byId("connection-detail");
    els.apiMethodCount = byId("api-method-count");
    els.apiMethods = byId("api-methods");
    els.idsFile = byId("ids-file");
    els.idsFileName = byId("ids-file-name");
    els.loadSampleBtn = byId("load-sample-btn");
    els.validateBtn = byId("validate-btn");
    els.createAllBcfBtn = byId("create-all-bcf-btn");
    els.metricObjects = byId("metric-objects");
    els.metricSpecs = byId("metric-specs");
    els.metricGroups = byId("metric-groups");
    els.metricPassed = byId("metric-passed");
    els.runStatus = byId("run-status");
    els.groupsRoot = byId("groups-root");
  }

  function bindEvents() {
    els.idsFile.addEventListener("change", onIdsFileSelected);
    els.loadSampleBtn.addEventListener("click", loadSampleIds);
    els.validateBtn.addEventListener("click", runValidation);
    els.createAllBcfBtn.addEventListener("click", createBcfForAllGroups);
  }

  function connectToStreamBim() {
    setConnectionState("Kobler til", "Venter pa parent frame", "");
    window.StreamBIM.connect({})
      .then(function (api) {
        state.streamBim.connected = true;
        state.streamBim.api = window.StreamBIM;
        state.streamBim.methods = listCallableMethods(state.streamBim.api);
        renderApiMethods();
        setConnectionState(
          "Tilkoblet",
          "Widgeten kan lese tilgjengelige parent-metoder",
          "state-ok",
        );
      })
      .catch(function (error) {
        state.streamBim.connected = false;
        state.streamBim.api = null;
        state.streamBim.methods = [];
        renderApiMethods();
        setConnectionState(
          "Ikke tilkoblet",
          getErrorMessage(error) ||
            "Kjor widgeten inne i StreamBIM for a hente modell-data",
          "state-error",
        );
      });
  }

  function setConnectionState(title, detail, className) {
    els.connectionStatus.textContent = title;
    els.connectionStatus.className = className || "";
    els.connectionDetail.textContent = detail;
  }

  function renderApiMethods() {
    var methods = state.streamBim.methods;
    els.apiMethodCount.textContent = methods.length + " metoder";
    if (!methods.length) {
      els.apiMethods.className = "method-list empty-state";
      els.apiMethods.textContent = "Ingen metoder oppdaget enna.";
      return;
    }
    els.apiMethods.className = "method-list";
    els.apiMethods.innerHTML = methods
      .map(function (methodName) {
        return '<div class="method-chip">' + escapeHtml(methodName) + "</div>";
      })
      .join("");
  }

  function onIdsFileSelected(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    readTextFile(file)
      .then(function (text) {
        state.idsText = text;
        state.idsName = file.name;
        els.idsFileName.textContent = file.name;
        setRunStatus("IDS lastet: " + file.name, "state-ok");
      })
      .catch(function (error) {
        setRunStatus(
          "Kunne ikke lese IDS-fil: " + getErrorMessage(error),
          "state-error",
        );
      });
  }

  function loadSampleIds() {
    fetch(SAMPLE_IDS)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Eksempel-IDS ble ikke funnet i widgetmappen.");
        }
        return response.text();
      })
      .then(function (text) {
        state.idsText = text;
        state.idsName = "Test_trekkekum.ids";
        els.idsFileName.textContent = state.idsName;
        setRunStatus("Eksempel-IDS lastet.", "state-ok");
      })
      .catch(function (error) {
        setRunStatus(
          "Kunne ikke laste eksempel-IDS: " + getErrorMessage(error),
          "state-error",
        );
      });
  }

  async function runValidation() {
    if (!state.idsText) {
      setRunStatus("Velg eller last inn en IDS-fil forst.", "state-warn");
      return;
    }
    if (!state.streamBim.connected || !state.streamBim.api) {
      setRunStatus(
        "Widgeten er ikke koblet til StreamBIM. Kjor den inne i StreamBIM for a hente IFC-data.",
        "state-error",
      );
      return;
    }

    toggleBusy(true);
    setRunStatus(
      "Henter modell-data fra StreamBIM og validerer mot IDS...",
      "",
    );

    try {
      var specs = parseIds(state.idsText);
      var modelData = await fetchModelDataFromStreamBim(state.streamBim.api);
      var report = validateObjects(specs, modelData.objects);
      state.validation = report;
      renderSummary(report);
      renderGroups(report);
      if (!report.summary.applicableObjectCount) {
        setRunStatus(
          "Validering ferdig, men ingen objekter matchet IDS applicability. Dette tyder pa at property-navnene fra StreamBIM fortsatt ikke treffer IDS-en.",
          "state-warn",
        );
      } else {
        setRunStatus(
          "Validering ferdig. " +
            report.summary.scopeCount +
            " modellag sjekket, " +
            report.groups.length +
            " feilgrupper opprettet fra " +
            report.summary.failedChecks +
            " avvik.",
          report.groups.length ? "state-warn" : "state-ok",
        );
      }
    } catch (error) {
      state.validation = null;
      renderSummary(null);
      renderGroups(null);
      setRunStatus(getErrorMessage(error), "state-error");
    } finally {
      toggleBusy(false);
    }
  }

  async function fetchModelDataFromStreamBim(api) {
    state.streamBim.methods = listCallableMethods(api);
    renderApiMethods();

    if (typeof api.getObjectInfoForSearch === "function") {
      return fetchViaObjectInfoSearch(api);
    }

    if (
      typeof api.findObjects === "function" &&
      typeof api.getObjectInfo === "function"
    ) {
      return fetchViaFindObjects(api);
    }

    var objectMethods = [
      "getObjectsWithProperties",
      "getModelObjectsWithProperties",
      "getAllObjectsWithProperties",
      "getObjects",
      "getModelObjects",
      "getElements",
      "getAllObjects",
      "getItems",
    ];
    var propertyMethods = [
      "getObjectProperties",
      "getProperties",
      "getPropertiesForObject",
      "getItemProperties",
      "getObjectById",
    ];
    var objectsResponse = null;
    var objectMethod = firstAvailableMethod(api, objectMethods);

    if (objectMethod) {
      objectsResponse = await invokeMethodGuessing(api, objectMethod, [
        undefined,
        {},
        { includeProperties: true },
        { withProperties: true },
        { includePropertySets: true },
      ]);
    }

    if (!objectsResponse) {
      throw new Error(
        "Fant ingen StreamBIM-metode for a lese modellobjekter. Tilgjengelige metoder: " +
          state.streamBim.methods.join(", "),
      );
    }

    var rawObjects = coerceArray(
      objectsResponse.objects || objectsResponse.items || objectsResponse,
    );
    var normalized = normalizeObjects(rawObjects);
    if (normalized.haveProperties) {
      return { objects: normalized.objects };
    }

    var propertyMethod = firstAvailableMethod(api, propertyMethods);
    if (!propertyMethod) {
      throw new Error(
        "Modellobjektene ble lest, men ingen property-metode ble funnet for videre validering.",
      );
    }

    var hydrated = [];
    for (var i = 0; i < normalized.objects.length; i += 1) {
      var object = normalized.objects[i];
      var propertyPayload = await invokeMethodGuessing(api, propertyMethod, [
        object.guid ? { guid: object.guid } : undefined,
        object.id ? { id: object.id } : undefined,
        object.guid || object.id || object.raw,
      ]);
      object.propertySets = mergePropertySets(
        object.propertySets,
        extractPropertySets(propertyPayload),
      );
      hydrated.push(object);
    }

    return { objects: hydrated };
  }

  async function fetchViaObjectInfoSearch(api) {
    var pageSize = 200;
    var skip = 0;
    var pageIndex = 0;
    var allObjects = [];
    var lastSignature = "";

    while (pageIndex < 100) {
      var response = await invokeMethodGuessing(api, "getObjectInfoForSearch", [
        {
          page: { limit: pageSize, skip: skip },
          sort: { field: "Name", descending: false },
          fieldUnion: true,
        },
        {
          filter: {},
          page: { limit: pageSize, skip: skip },
          sort: { field: "Name", descending: false },
          fieldUnion: true,
        },
        {
          filter: { key: "Name", value: "" },
          page: { limit: pageSize, skip: skip },
          sort: { field: "Name", descending: false },
          fieldUnion: true,
        },
        {
          filter: { key: "ID", value: "" },
          page: { limit: pageSize, skip: skip },
          sort: { field: "ID", descending: false },
          fieldUnion: true,
        },
        {
          page: { limit: pageSize, skip: skip },
          fieldUnion: true,
        },
      ]);
      var pageObjects = extractObjectsFromResponse(response);
      if (!pageObjects.length) {
        break;
      }

      var signature = buildPageSignature(pageObjects);
      if (pageIndex > 0 && signature && signature === lastSignature) {
        break;
      }

      allObjects = allObjects.concat(pageObjects);
      lastSignature = signature;
      if (pageObjects.length < pageSize) {
        break;
      }

      skip += pageSize;
      pageIndex += 1;
    }

    if (!allObjects.length) {
      throw new Error(
        "StreamBIM svarte, men returnerte ingen objektdata fra getObjectInfoForSearch.",
      );
    }

    return { objects: normalizeObjects(allObjects).objects };
  }

  async function fetchViaFindObjects(api) {
    var pageSize = 200;
    var skip = 0;
    var pageIndex = 0;
    var allGuids = [];
    var lastSignature = "";

    while (pageIndex < 100) {
      var response = await invokeMethodGuessing(api, "findObjects", [
        {
          key: "Name",
          value: "",
          limit: pageSize,
          skip: skip,
        },
        {
          key: "ID",
          value: "",
          limit: pageSize,
          skip: skip,
        },
        {
          filter: { key: "Name", value: "" },
          page: { limit: pageSize, skip: skip },
          sort: { field: "Name", descending: false },
        },
        {
          filter: { key: "ID", value: "" },
          page: { limit: pageSize, skip: skip },
          sort: { field: "ID", descending: false },
        },
      ]);
      var pageGuids = extractGuidsFromResponse(response);
      if (!pageGuids.length) {
        break;
      }

      var signature = pageGuids.slice(0, 10).join("|");
      if (pageIndex > 0 && signature && signature === lastSignature) {
        break;
      }

      allGuids = allGuids.concat(pageGuids);
      lastSignature = signature;
      if (pageGuids.length < pageSize) {
        break;
      }

      skip += pageSize;
      pageIndex += 1;
    }

    if (!allGuids.length) {
      throw new Error(
        "StreamBIM svarte, men returnerte ingen GUID-er fra findObjects.",
      );
    }

    var objects = [];
    for (var i = 0; i < allGuids.length; i += 1) {
      var guid = allGuids[i];
      objects.push(await api.getObjectInfo(guid));
    }

    return { objects: normalizeObjects(objects).objects };
  }

  function extractObjectsFromResponse(response) {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response;
    }

    var candidates = [
      response.items,
      response.objects,
      response.results,
      response.rows,
      response.data,
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      if (Array.isArray(candidates[i])) {
        return candidates[i];
      }
    }

    return [];
  }

  function extractGuidsFromResponse(response) {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response
        .map(function (item) {
          if (typeof item === "string") {
            return item;
          }
          return pickFirst(item, ["guid", "globalId", "ifcGuid", "GlobalId"]);
        })
        .filter(Boolean);
    }

    return extractGuidsFromResponse(
      response.items || response.objects || response.results || response.rows,
    );
  }

  function buildPageSignature(items) {
    return items
      .slice(0, 10)
      .map(function (item) {
        return (
          pickFirst(item, ["guid", "globalId", "ifcGuid", "GlobalId"]) ||
          pickFirst(item, ["id", "objectId", "dbId", "expressId"]) ||
          JSON.stringify(item).slice(0, 80)
        );
      })
      .join("|");
  }

  function firstAvailableMethod(api, candidates) {
    for (var i = 0; i < candidates.length; i += 1) {
      if (api && typeof api[candidates[i]] === "function") {
        return candidates[i];
      }
    }
    return "";
  }

  async function invokeMethodGuessing(api, methodName, argsList) {
    var fn = api[methodName];
    if (typeof fn !== "function") {
      return null;
    }
    var errors = [];
    for (var i = 0; i < argsList.length; i += 1) {
      try {
        if (typeof argsList[i] === "undefined") {
          return await fn();
        }
        return await fn(argsList[i]);
      } catch (error) {
        errors.push(getErrorMessage(error));
      }
    }
    throw new Error(
      methodName + " feilet. Forsokte argumentvarianter: " + errors.join(" | "),
    );
  }

  function normalizeObjects(rawObjects) {
    var objects = [];
    var haveProperties = false;

    coerceArray(rawObjects).forEach(function (item, index) {
      if (!item || typeof item !== "object") {
        return;
      }
      var propertySets = extractPropertySets(item);
      haveProperties = haveProperties || Object.keys(propertySets).length > 0;
      objects.push({
        id:
          pickFirst(item, ["id", "objectId", "dbId", "expressId"]) ||
          "obj-" + index,
        guid:
          pickFirst(item, ["guid", "globalId", "ifcGuid", "GlobalId"]) || "",
        name:
          pickFirst(item, ["name", "label", "title", "displayName", "Name"]) ||
          pickFirst(item, ["guid", "globalId", "ifcGuid"]) ||
          "Objekt " + (index + 1),
        type:
          pickFirst(item, [
            "ifcClass",
            "type",
            "entity",
            "className",
            "category",
            "IfcClass",
          ]) || "Ukjent type",
        propertySets: propertySets,
        raw: item,
      });
    });

    return { objects: objects, haveProperties: haveProperties };
  }

  function extractPropertySets(source) {
    if (!source || typeof source !== "object") {
      return {};
    }

    var containers = [
      { value: source.propertySets, fallbackSetName: "", allowFlatMap: false },
      { value: source.psets, fallbackSetName: "", allowFlatMap: false },
      {
        value: source.properties,
        fallbackSetName: "__flat__",
        allowFlatMap: true,
      },
      {
        value: source.propertySetData,
        fallbackSetName: "__flat__",
        allowFlatMap: true,
      },
      { value: source.data, fallbackSetName: "__flat__", allowFlatMap: true },
    ];

    for (var i = 0; i < containers.length; i += 1) {
      var extracted = normalizePropertyContainer(
        containers[i].value,
        containers[i].fallbackSetName,
        containers[i].allowFlatMap,
      );
      if (Object.keys(extracted).length) {
        return extracted;
      }
    }

    return normalizePropertyContainer(source, "", false);
  }

  function normalizePropertyContainer(
    container,
    fallbackSetName,
    allowFlatMap,
  ) {
    if (!container) {
      return {};
    }

    if (Array.isArray(container)) {
      return normalizePropertyArray(container);
    }

    if (typeof container !== "object") {
      return {};
    }

    var propertySets = {};
    var flatValues = {};
    Object.keys(container).forEach(function (key) {
      var value = container[key];
      if (Array.isArray(value)) {
        var fromArray = normalizePropertyArray(value, key);
        propertySets = mergePropertySets(propertySets, fromArray);
        return;
      }
      if (value && typeof value === "object") {
        if (hasPropertyIdentity(value)) {
          propertySets[key] = propertySets[key] || {};
          propertySets[key][value.name || value.baseName || key] =
            stringifyValue(
              firstDefined([
                value.value,
                value.nominalValue,
                value.displayValue,
                value.Value,
              ]),
            );
          return;
        }
        propertySets[key] = flattenPropertyMap(value);
        return;
      }
      if (allowFlatMap) {
        flatValues[key] = stringifyValue(value);
      }
    });

    if (allowFlatMap && Object.keys(flatValues).length) {
      propertySets[fallbackSetName || "__flat__"] = Object.assign(
        {},
        propertySets[fallbackSetName || "__flat__"] || {},
        flatValues,
      );
    }

    return propertySets;
  }

  function normalizePropertyArray(items, fallbackSetName) {
    var propertySets = {};
    items.forEach(function (item) {
      if (!item || typeof item !== "object") {
        return;
      }
      if (item.properties || item.values || item.entries) {
        var setName =
          item.name ||
          item.propertySet ||
          item.propertySetName ||
          fallbackSetName ||
          "Default";
        propertySets[setName] = flattenPropertyMap(
          item.properties || item.values || item.entries,
        );
        return;
      }
      if (hasPropertyIdentity(item)) {
        var propertySetName =
          item.propertySet ||
          item.propertySetName ||
          item.set ||
          fallbackSetName ||
          "Default";
        propertySets[propertySetName] = propertySets[propertySetName] || {};
        propertySets[propertySetName][item.name || item.baseName || item.key] =
          stringifyValue(
            firstDefined([
              item.value,
              item.nominalValue,
              item.displayValue,
              item.Value,
            ]),
          );
      }
    });
    return propertySets;
  }

  function flattenPropertyMap(map) {
    if (!map || typeof map !== "object") {
      return {};
    }
    var flat = {};
    Object.keys(map).forEach(function (key) {
      var value = map[key];
      if (value && typeof value === "object" && hasPropertyIdentity(value)) {
        flat[value.name || value.baseName || key] = stringifyValue(
          firstDefined([
            value.value,
            value.nominalValue,
            value.displayValue,
            value.Value,
          ]),
        );
        return;
      }
      if (value && typeof value === "object" && "value" in value) {
        flat[key] = stringifyValue(value.value);
        return;
      }
      flat[key] = stringifyValue(value);
    });
    return flat;
  }

  function hasPropertyIdentity(item) {
    return !!(
      item &&
      typeof item === "object" &&
      (item.name || item.baseName || item.key) &&
      typeof firstDefined([
        item.value,
        item.nominalValue,
        item.displayValue,
        item.Value,
        item.value === "" ? "" : undefined,
      ]) !== "undefined"
    );
  }

  function mergePropertySets(left, right) {
    var result = {};
    var allKeys = Object.keys(left || {}).concat(Object.keys(right || {}));
    allKeys.forEach(function (key) {
      result[key] = Object.assign(
        {},
        (left || {})[key] || {},
        (right || {})[key] || {},
      );
    });
    return result;
  }

  function parseIds(xmlText) {
    var parser = new DOMParser();
    var xml = parser.parseFromString(xmlText, "application/xml");
    var parserError = xml.querySelector("parsererror");
    if (parserError) {
      throw new Error("IDS-filen kunne ikke parses som XML.");
    }

    var specEls = Array.prototype.slice.call(
      xml.getElementsByTagNameNS(IDS_NS, "specification"),
    );
    if (!specEls.length) {
      throw new Error("Fant ingen ids:specification i IDS-filen.");
    }

    return specEls.map(function (specEl) {
      return {
        name: specEl.getAttribute("name") || "Uten navn",
        applicability: parseIdsRules(childByLocalName(specEl, "applicability")),
        requirements: parseIdsRules(childByLocalName(specEl, "requirements")),
      };
    });
  }

  function parseIdsRules(parent) {
    if (!parent) {
      return [];
    }
    return childElementsByLocalName(parent, "property").map(
      function (propertyEl) {
        return {
          propertySet: textFromNested(propertyEl, [
            "propertySet",
            "simpleValue",
          ]),
          baseName: textFromNested(propertyEl, ["baseName", "simpleValue"]),
          cardinality: propertyEl.getAttribute("cardinality") || "required",
          valueRule: parseIdsValueRule(childByLocalName(propertyEl, "value")),
        };
      },
    );
  }

  function parseIdsValueRule(valueEl) {
    if (!valueEl) {
      return { type: "any" };
    }
    var simple = textFromNested(valueEl, ["simpleValue"]);
    if (simple !== "") {
      return { type: "equals", value: simple };
    }
    var restriction = childByLocalName(valueEl, "restriction");
    if (!restriction) {
      var nestedRestriction = valueEl.getElementsByTagNameNS(
        "http://www.w3.org/2001/XMLSchema",
        "restriction",
      )[0];
      if (nestedRestriction) {
        restriction = nestedRestriction;
      }
    }
    if (restriction) {
      var patternNodes = restriction.getElementsByTagNameNS(
        "http://www.w3.org/2001/XMLSchema",
        "pattern",
      );
      if (patternNodes.length) {
        return {
          type: "pattern",
          value: patternNodes[0].getAttribute("value") || ".*",
        };
      }
    }
    return { type: "any" };
  }

  function validateObjects(specs, objects) {
    var groupsByKey = {};
    var passedChecks = 0;
    var failedChecks = 0;

    objects.forEach(function (object) {
      specs.forEach(function (spec) {
        if (!matchesAllRules(object, spec.applicability)) {
          return;
        }

        spec.requirements.forEach(function (rule) {
          var actual = getPropertyValue(
            object,
            rule.propertySet,
            rule.baseName,
          );
          var outcome = evaluateRule(actual, rule);
          if (outcome.ok) {
            passedChecks += 1;
            return;
          }

          failedChecks += 1;
          var key = [
            spec.name,
            rule.propertySet,
            rule.baseName,
            outcome.reasonCode,
          ].join("::");

          if (!groupsByKey[key]) {
            groupsByKey[key] = {
              key: key,
              specName: spec.name,
              propertySet: rule.propertySet,
              propertyName: rule.baseName,
              reasonCode: outcome.reasonCode,
              title: buildGroupTitle(spec, rule, outcome),
              description: buildGroupDescription(rule, outcome),
              objects: [],
            };
          }

          groupsByKey[key].objects.push({
            id: object.id,
            guid: object.guid,
            name: object.name,
            type: object.type,
            actualValue: actual,
            expectedValue: describeRule(rule.valueRule),
          });
        });
      });
    });

    var groups = Object.keys(groupsByKey)
      .map(function (key) {
        return groupsByKey[key];
      })
      .sort(function (a, b) {
        return b.objects.length - a.objects.length;
      });

    return {
      groups: groups,
      summary: {
        objectCount: objects.length,
        specCount: specs.length,
        passedChecks: passedChecks,
        failedChecks: failedChecks,
      },
    };
  }

  function matchesAllRules(object, rules) {
    return rules.every(function (rule) {
      return evaluateRule(
        getPropertyValue(object, rule.propertySet, rule.baseName),
        rule,
      ).ok;
    });
  }

  function evaluateRule(actualValue, rule) {
    var hasValue =
      actualValue !== null &&
      actualValue !== undefined &&
      String(actualValue).trim() !== "";
    var matches = matchValueRule(actualValue, rule.valueRule);

    if (rule.cardinality === "required") {
      if (!hasValue) {
        return { ok: false, reasonCode: "missing-required" };
      }
      if (!matches) {
        return { ok: false, reasonCode: "invalid-value" };
      }
      return { ok: true };
    }

    if (rule.cardinality === "optional") {
      if (!hasValue) {
        return { ok: true };
      }
      if (!matches) {
        return { ok: false, reasonCode: "invalid-optional-value" };
      }
      return { ok: true };
    }

    if (rule.cardinality === "prohibited") {
      if (!hasValue) {
        return { ok: true };
      }
      if (matches) {
        return { ok: false, reasonCode: "prohibited-value" };
      }
      return { ok: true };
    }

    return matches ? { ok: true } : { ok: false, reasonCode: "rule-failed" };
  }

  function matchValueRule(actualValue, valueRule) {
    if (!valueRule || valueRule.type === "any") {
      return true;
    }
    var actual =
      actualValue === null || actualValue === undefined
        ? ""
        : String(actualValue);
    if (valueRule.type === "equals") {
      return actual.trim() === valueRule.value.trim();
    }
    if (valueRule.type === "pattern") {
      try {
        return new RegExp(valueRule.value).test(actual);
      } catch (error) {
        return false;
      }
    }
    return true;
  }

  function getPropertyValue(object, propertySet, propertyName) {
    if (!object || !object.propertySets) {
      return null;
    }

    if (
      object.propertySets[propertySet] &&
      Object.prototype.hasOwnProperty.call(
        object.propertySets[propertySet],
        propertyName,
      )
    ) {
      return object.propertySets[propertySet][propertyName];
    }

    var flatKeys = [
      propertyName,
      propertySet + "." + propertyName,
      propertySet + ":" + propertyName,
      propertySet + "/" + propertyName,
      propertySet + ">" + propertyName,
    ];

    for (var i = 0; i < flatKeys.length; i += 1) {
      if (
        object.propertySets.__flat__ &&
        Object.prototype.hasOwnProperty.call(
          object.propertySets.__flat__,
          flatKeys[i],
        )
      ) {
        return object.propertySets.__flat__[flatKeys[i]];
      }
    }

    var setNames = Object.keys(object.propertySets);
    for (var j = 0; j < setNames.length; j += 1) {
      if (
        Object.prototype.hasOwnProperty.call(
          object.propertySets[setNames[j]],
          propertyName,
        )
      ) {
        return object.propertySets[setNames[j]][propertyName];
      }
    }

    return null;
  }

  function buildGroupTitle(spec, rule, outcome) {
    if (outcome.reasonCode === "missing-required") {
      return (
        "Manglende pakrevd verdi: " +
        rule.propertySet +
        "." +
        rule.baseName +
        " i spesifikasjonen " +
        spec.name
      );
    }
    if (outcome.reasonCode === "prohibited-value") {
      return "Forbudt verdi pa " + rule.propertySet + "." + rule.baseName;
    }
    return "Ugyldig verdi pa " + rule.propertySet + "." + rule.baseName;
  }

  function buildGroupDescription(rule, outcome) {
    if (outcome.reasonCode === "missing-required") {
      return "Objektene matcher applicability, men mangler en verdi som IDS krever.";
    }
    if (
      outcome.reasonCode === "invalid-value" ||
      outcome.reasonCode === "invalid-optional-value"
    ) {
      return "Objektene har en verdi som ikke tilfredsstiller IDS-regelen.";
    }
    if (outcome.reasonCode === "prohibited-value") {
      return "Objektene har en verdi som ikke skal finnes for denne spesifikasjonen.";
    }
    return "Objektene bryter en IDS-regel.";
  }

  function describeRule(valueRule) {
    if (!valueRule || valueRule.type === "any") {
      return "Enhver verdi";
    }
    if (valueRule.type === "equals") {
      return 'Lik "' + valueRule.value + '"';
    }
    if (valueRule.type === "pattern") {
      return "Matcher /" + valueRule.value + "/";
    }
    return "Ukjent regel";
  }

  function renderSummary(report) {
    if (!report) {
      els.metricObjects.textContent = "0";
      els.metricSpecs.textContent = "0";
      els.metricGroups.textContent = "0";
      els.metricPassed.textContent = "0";
      return;
    }

    els.metricObjects.textContent = String(report.summary.objectCount);
    els.metricSpecs.textContent = String(report.summary.specCount);
    els.metricGroups.textContent = String(report.groups.length);
    els.metricPassed.textContent = String(report.summary.passedChecks);
  }

  function renderGroups(report) {
    if (!report || !report.scopes || !report.scopes.length) {
      els.groupsRoot.className = "group-list empty-state";
      els.groupsRoot.textContent = "Ingen grupperte avvik a vise.";
      return;
    }

    els.groupsRoot.className = "group-list";
    els.groupsRoot.innerHTML = report.scopes
      .map(function (scope) {
        return [
          '<section class="scope-section">',
          '  <div class="scope-head">',
          "    <div>",
          '      <p class="scope-title">' + escapeHtml(scope.scopeLabel) + "</p>",
          '      <p class="scope-meta">' +
            escapeHtml(
              scope.objectCount +
                " objekter, " +
                scope.summary.applicableObjectCount +
                " matcher IDS applicability, " +
                scope.groups.length +
                " feilgrupper",
            ) +
            "</p>",
          "    </div>",
          '    <div class="badge">' + scope.summary.failedChecks + " avvik</div>",
          "  </div>",
          '  <div class="scope-groups">' +
            (scope.groups.length
              ? scope.groups
                  .map(function (group) {
                    return [
                      '<article class="group-card">',
                      '  <div class="group-head">',
                      "    <div>",
                      '      <p class="group-title">' +
                        escapeHtml(group.title) +
                        "</p>",
                      '      <div class="group-code">' +
                        escapeHtml(group.propertySet + "." + group.propertyName) +
                        "</div>",
                      '      <p class="group-meta">' +
                        escapeHtml(group.description) +
                        "</p>",
                      "    </div>",
                      '    <div class="badge">' +
                        group.objects.length +
                        " treff</div>",
                      "  </div>",
                      '  <div class="group-body">',
                      '      <div class="group-actions">',
                      '          <button class="btn btn-primary" type="button" data-action="create-bcf" data-group-index="' +
                        group.globalIndex +
                        '">Opprett BCF</button>',
                      "      </div>",
                      '      <ol class="object-list">' +
                        group.objects
                          .map(function (object) {
                            return (
                              "<li><strong>" +
                              escapeHtml(object.name) +
                              "</strong> (" +
                              escapeHtml(object.type) +
                              ")" +
                              (object.guid
                                ? " GUID: " + escapeHtml(object.guid)
                                : "") +
                              "<br />Forventet: " +
                              escapeHtml(object.expectedValue) +
                              " | Faktisk: " +
                              escapeHtml(object.actualValue || "[mangler]")
                            );
                          })
                          .join("</li>") +
                        "</li></ol>",
                      "  </div>",
                      "</article>",
                    ].join("");
                  })
                  .join("")
              : '<div class="scope-empty">Ingen avvik funnet i dette modellaget.</div>') +
            "</div>",
          "</section>",
        ].join("");
      })
      .join("");

    Array.prototype.slice
      .call(els.groupsRoot.querySelectorAll('[data-action="create-bcf"]'))
      .forEach(function (button) {
        button.addEventListener("click", function () {
          var groupIndex = Number(button.getAttribute("data-group-index"));
          createBcfForGroup(groupIndex);
        });
      });
  }

  async function createBcfForGroup(groupIndex) {
    if (!state.validation || !state.validation.groups[groupIndex]) {
      return;
    }
    var group = state.validation.groups[groupIndex];
    try {
      await createBcfIssue(group);
      setRunStatus(
        'BCF opprettet for gruppen "' +
          group.title +
          '" i ' +
          group.scopeLabel +
          ".",
        "state-ok",
      );
    } catch (error) {
      setRunStatus(
        "Kunne ikke opprette BCF: " + getErrorMessage(error),
        "state-error",
      );
    }
  }

  async function createBcfForAllGroups() {
    if (!state.validation || !state.validation.groups.length) {
      setRunStatus("Ingen feilgrupper a opprette BCF fra.", "state-warn");
      return;
    }
    var created = 0;
    for (var i = 0; i < state.validation.groups.length; i += 1) {
      try {
        await createBcfIssue(state.validation.groups[i]);
        created += 1;
      } catch (error) {
        setRunStatus(
          "BCF stoppet etter " +
            created +
            " grupper. Siste feil: " +
            getErrorMessage(error),
          "state-error",
        );
        return;
      }
    }
    setRunStatus("BCF opprettet for " + created + " grupper.", "state-ok");
  }

  async function createBcfIssue(group) {
    var api = state.streamBim.api;
    var methodName = firstAvailableMethod(api, [
      "createBcfIssue",
      "createIssue",
      "addIssue",
      "createBcf",
      "createTopic",
    ]);

    if (!methodName) {
      throw new Error(
        "Fant ingen API-metode for BCF-opprettelse. Tilgjengelige metoder: " +
          state.streamBim.methods.join(", "),
      );
    }

    var payload = {
      title: group.scopeLabel + ": " + group.title,
      description:
        group.description +
        "\n\nModellag: " +
        group.scopeLabel +
        "\nModel: " +
        (group.modelName || "-") +
        "\nLayer: " +
        (group.layerName || "-") +
        "\n\nSpec: " +
        group.specName +
        "\nProperty: " +
        group.propertySet +
        "." +
        group.propertyName +
        "\nAntall objekter: " +
        group.objects.length,
      labels: [
        "IDS",
        "SVV",
        sanitizeLabel(group.scopeLabel),
        group.propertySet,
        group.propertyName,
      ],
      objects: group.objects.map(function (object) {
        return {
          guid: object.guid,
          id: object.id,
          title: object.name,
          type: object.type,
        };
      }),
    };

    return invokeMethodGuessing(api, methodName, [
      payload,
      { issue: payload },
      { topic: payload },
    ]);
  }

  function setRunStatus(message, className) {
    els.runStatus.textContent = message;
    els.runStatus.className = "run-status " + (className || "");
  }

  function toggleBusy(isBusy) {
    els.validateBtn.disabled = isBusy;
    els.createAllBcfBtn.disabled = isBusy;
    els.loadSampleBtn.disabled = isBusy;
  }

  function childByLocalName(parent, localName) {
    var children = childElementsByLocalName(parent, localName);
    return children.length ? children[0] : null;
  }

  function childElementsByLocalName(parent, localName) {
    if (!parent) {
      return [];
    }
    return Array.prototype.slice.call(parent.children).filter(function (child) {
      return child.localName === localName;
    });
  }

  function textFromNested(root, path) {
    var current = root;
    for (var i = 0; i < path.length; i += 1) {
      if (!current) {
        return "";
      }
      current = childByLocalName(current, path[i]);
    }
    return current ? decodeHtmlEntities(current.textContent || "").trim() : "";
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function listCallableMethods(api) {
    if (!api) {
      return [];
    }

    return Object.getOwnPropertyNames(api)
      .filter(function (name) {
        return (
          typeof api[name] === "function" &&
          name.charAt(0) !== "_" &&
          name !== "connect" &&
          name !== "connectToChild"
        );
      })
      .sort();
  }

  function coerceArray(value) {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function pickFirst(source, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      if (source[keys[i]]) {
        return source[keys[i]];
      }
    }
    return "";
  }

  function firstDefined(values) {
    for (var i = 0; i < values.length; i += 1) {
      if (typeof values[i] !== "undefined") {
        return values[i];
      }
    }
    return undefined;
  }

  function stringifyValue(value) {
    if (value === null || typeof value === "undefined") {
      return "";
    }
    if (typeof value === "string") {
      return decodeHtmlEntities(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value && typeof value === "object") {
      if ("value" in value) {
        return stringifyValue(value.value);
      }
      if ("displayValue" in value) {
        return stringifyValue(value.displayValue);
      }
    }
    return String(value);
  }

  function readTextFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Lesing av fil feilet."));
      };
      reader.readAsText(file, "utf-8");
    });
  }

  function decodeHtmlEntities(input) {
    var textarea = document.createElement("textarea");
    textarea.innerHTML = input;
    return textarea.value;
  }

  function getErrorMessage(error) {
    if (!error) {
      return "Ukjent feil.";
    }
    if (typeof error === "string") {
      return error;
    }
    return error.message || JSON.stringify(error);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
