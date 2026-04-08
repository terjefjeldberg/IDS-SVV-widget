(function () {
  "use strict";

  var SAMPLE_IDS = "./Test_trekkekum.ids";
  var IDS_NS = "http://standards.buildingsmart.org/IDS";
  var BUILD_ID = "2026-03-27-bcf-capture-1";
  var DEBUG_PROPERTY_SET = "Trekkekum_853";
  var DEBUG_PROPERTY_NAME = "AntallRor_10840";

  var state = {
    streamBim: {
      connected: false,
      api: null,
      methods: [],
      connectPromise: null,
      lastConnectError: "",
      rawIfcExportVariant: "",
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
    renderBuildInfo();
    connectToStreamBim();
  }

  function bindElements() {
    els.connectionStatus = byId("connection-status");
    els.connectionDetail = byId("connection-detail");
    els.apiMethodCount = byId("api-method-count");
    els.apiHint = byId("api-hint");
    els.apiMethods = byId("api-methods");
    els.idsFile = byId("ids-file");
    els.idsFileName = byId("ids-file-name");
    els.loadSampleBtn = byId("load-sample-btn");
    els.validateBtn = byId("validate-btn");
    els.createAllBcfBtn = byId("create-all-bcf-btn");
    els.metricObjects = byId("metric-objects");
    els.metricSpecs = byId("metric-specs");
    els.metricGroups = byId("metric-groups");
    els.runStatus = byId("run-status");
    els.resultTableRoot = byId("result-table-root");
    els.propertyDebugRoot = byId("property-debug-root");
    els.groupsRoot = byId("groups-root");
  }

  function renderBuildInfo() {
    if (els.connectionDetail) {
      els.connectionDetail.textContent =
        "Build " + BUILD_ID + " - venter på parent frame";
    }
    if (typeof console !== "undefined" && console.info) {
      console.info("[IDS SVV] Build", BUILD_ID);
    }
  }

  function bindEvents() {
    els.idsFile.addEventListener("change", onIdsFileSelected);
    els.loadSampleBtn.addEventListener("click", loadSampleIds);
    els.validateBtn.addEventListener("click", runValidation);
    if (els.createAllBcfBtn) {
      els.createAllBcfBtn.addEventListener("click", createBcfForAllGroups);
    }
    if (els.groupsRoot) {
      els.groupsRoot.addEventListener("click", onObjectActionClick);
    }
    if (els.propertyDebugRoot) {
      els.propertyDebugRoot.addEventListener("click", onObjectActionClick);
    }
  }

  function connectToStreamBim() {
    if (state.streamBim.connected && state.streamBim.api) {
      return Promise.resolve(true);
    }
    if (!window.StreamBIM || typeof window.StreamBIM.connect !== "function") {
      state.streamBim.connected = false;
      state.streamBim.api = null;
      state.streamBim.methods = [];
      renderApiMethods();
      return Promise.resolve(false);
    }
    if (state.streamBim.connectPromise) {
      return state.streamBim.connectPromise;
    }
    setConnectionState(
      "Kobler til",
      "Build " + BUILD_ID + " - venter p? parent frame",
      "",
    );
    state.streamBim.connectPromise = window.StreamBIM.connect({})
      .then(function () {
        state.streamBim.lastConnectError = "";
        state.streamBim.connected = true;
        state.streamBim.api = window.StreamBIM;
        state.streamBim.methods = listCallableMethods(window.StreamBIM);
        renderApiMethods();
        setConnectionState(
          "Tilkoblet",
          "Widgeten kan lese tilgjengelige parent-metoder",
          "state-ok",
        );
        return true;
      })
      .catch(function (error) {
        var fallbackApi = window.StreamBIM;
        var fallbackMethods = listCallableMethods(fallbackApi);
        if (hasUsableStreamBimApi(fallbackApi, fallbackMethods)) {
          state.streamBim.lastConnectError = "";
          state.streamBim.connected = true;
          state.streamBim.api = fallbackApi;
          state.streamBim.methods = fallbackMethods;
          renderApiMethods();
          setConnectionState(
            "Tilkoblet",
            "Bruker tilgjengelige StreamBIM-metoder uten ny handshake",
            "state-ok",
          );
          return true;
        }

        state.streamBim.lastConnectError = getErrorMessage(error);
        state.streamBim.connected = false;
        state.streamBim.api = null;
        state.streamBim.methods = [];
        renderApiMethods();
        setConnectionState(
          "Ikke tilkoblet",
          getErrorMessage(error) ||
            "Kj?r widgeten inne i StreamBIM for ? hente modell-data",
          "state-error",
        );
        return false;
      })
      .then(function (connected) {
        state.streamBim.connectPromise = null;
        return connected;
      });
    return state.streamBim.connectPromise;
  }
  function setConnectionState(title, detail, className) {
    if (els.connectionStatus) {
      els.connectionStatus.textContent = title;
      els.connectionStatus.className = className || "";
    }
    if (els.connectionDetail) {
      els.connectionDetail.textContent = detail;
    }
  }

  function hasUsableStreamBimApi(api, methods) {
    var callable = methods || listCallableMethods(api);
    var requiredAny = [
      "makeApiRequest",
      "findObjects",
      "getObjects",
      "getAllObjects",
      "getFloors",
      "getFloorObjects",
    ];
    return requiredAny.some(function (name) {
      return callable.indexOf(name) >= 0;
    });
  }

  function renderApiMethods() {
    var methods = state.streamBim.methods;
    if (els.apiMethodCount) {
      els.apiMethodCount.textContent = methods.length + " metoder";
    }
    if (!methods.length) {
      if (els.apiHint) {
        els.apiHint.textContent =
          "BCF-støtte kan ikke vurderes før tilkoblingen er etablert.";
      }
      if (els.apiMethods) {
        els.apiMethods.className = "method-list empty-state";
        els.apiMethods.textContent = "Ingen metoder oppdaget ennå.";
      }
      updateBcfUi();
      return;
    }

    if (els.apiHint) {
      els.apiHint.textContent = supportsBcfCreation(state.streamBim.api)
        ? "BCF-opprettelse er tilgjengelig i denne instansen."
        : "BCF-opprettelse er ikke eksponert i denne widget-instansen.";
    }

    if (els.apiMethods) {
      els.apiMethods.className = "method-list";
      els.apiMethods.innerHTML = methods
        .map(function (methodName) {
          return '<div class="method-chip">' + escapeHtml(methodName) + "</div>";
        })
        .join("");
    }
    updateBcfUi();
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
      setRunStatus("Velg eller last inn en IDS-fil først.", "state-warn");
      return;
    }
    if (!state.streamBim.connected || !state.streamBim.api) {
      var connected = await connectToStreamBim();
      if (!connected || !state.streamBim.connected || !state.streamBim.api) {
        var connectDetails = state.streamBim.lastConnectError
          ? " (" + state.streamBim.lastConnectError + ")"
          : "";
        setRunStatus(
          "Widgeten er ikke koblet til StreamBIM. Kj?r den inne i StreamBIM for ? hente IFC-data." +
            connectDetails,
          "state-error",
        );
        return;
      }
    }

    toggleBusy(true);
    setRunStatus(
      "Henter modell-data fra StreamBIM og validerer mot IDS...",
      "",
    );

    try {
      var specs = parseIds(state.idsText);
      var modelData = await fetchModelDataFromStreamBim(
        state.streamBim.api,
        specs,
      );
      var report = validateObjects(specs, modelData.objects);
      state.validation = report;
      renderSummary(report);
      renderResultTable(report);
      renderPropertyDebug(specs, modelData.objects);
      renderGroups(report);

      if (!report.summary.applicableObjectCount) {
        var noMatchMessage =
          "Validering ferdig, men ingen objekter ble vurdert mot kravene i IDS-en.";
        var uniqueObjectCount = countUniqueObjects(modelData.objects || []);
        if (uniqueObjectCount) {
          noMatchMessage +=
            " Widgeten leste " +
            uniqueObjectCount +
            " objekter, men fant ingen som var relevante for denne IDS-en.";
        }
        noMatchMessage +=
          " Sjekk at utvalget i IDS-en bruker property-navn og verdier som faktisk finnes i StreamBIM.";
        setRunStatus(noMatchMessage, "state-warn");
      } else {
        if (report.groups.length) {
          setRunStatus(
            "Validering ferdig. " +
              report.summary.scopeCount +
              " modellag sjekket, " +
              report.groups.length +
              " feilgrupper med " +
              report.summary.failedChecks +
              " verdiavvik.",
            "state-warn",
          );
        } else {
          setRunStatus(
            "Validering ferdig. " +
              report.summary.scopeCount +
              " modellag sjekket. Ingen verdiavvik funnet.",
            "state-ok",
          );
        }
      }
    } catch (error) {
      state.validation = null;
      renderSummary(null);
      renderResultTable(null);
      renderPropertyDebug(null, null);
      renderGroups(null);
      setRunStatus(getErrorMessage(error), "state-error");
    } finally {
      toggleBusy(false);
    }
  }

  async function fetchModelDataFromStreamBim(api, specs) {
    state.streamBim.methods = listCallableMethods(api);
    renderApiMethods();

    var diagnostics = [];
    var targeted = { objects: [], diagnostic: "" };
    var fallback = { objects: [], diagnostic: "" };
    var best = { objects: [], diagnostic: "" };
    var collectedObjects = [];
    var genericObjectMethods = [
      "getObjectsWithProperties",
      "getModelObjectsWithProperties",
      "getAllObjectsWithProperties",
      "getObjects",
      "getModelObjects",
      "getElements",
      "getAllObjects",
      "getItems",
    ];
    var genericMethodAvailable = firstAvailableMethod(
      api,
      genericObjectMethods,
    );

    if (
      typeof api.findObjects === "function" &&
      typeof api.getObjectInfo === "function"
    ) {
      fallback = await fetchViaFindObjects(api);
      if (fallback.objects.length) {
        collectedObjects = mergeUniqueObjects(
          collectedObjects,
          fallback.objects,
        );
        if (collectedObjects.length > best.objects.length) {
          best = {
            objects: collectedObjects.slice(),
            diagnostic: fallback.diagnostic || "",
          };
        }
      } else if (fallback.diagnostic) {
        diagnostics.push(fallback.diagnostic);
      }

      targeted = await fetchViaApplicabilitySearch(api, specs);
      if (targeted.objects.length) {
        collectedObjects = mergeUniqueObjects(
          collectedObjects,
          targeted.objects,
        );
        if (
          collectedObjects.length > best.objects.length ||
          !best.objects.length
        ) {
          best = {
            objects: collectedObjects.slice(),
            diagnostic: targeted.diagnostic || "",
          };
        }
      } else if (targeted.diagnostic) {
        diagnostics.push(targeted.diagnostic);
      }

      if (
        best.objects.length &&
        (targeted.objects.length || fallback.objects.length > 1)
      ) {
        return best;
      }
    }

    if (
      typeof api.makeApiRequest === "function" &&
      typeof api.getProjectId === "function" &&
      typeof api.getBuildingId === "function" &&
      typeof api.getObjectInfo === "function"
    ) {
      fallback = await fetchViaRawIfcSearch(api, specs);
      if (fallback.objects.length) {
        collectedObjects = mergeUniqueObjects(
          collectedObjects,
          fallback.objects,
        );
        if (collectedObjects.length > best.objects.length) {
          best = {
            objects: collectedObjects.slice(),
            diagnostic: fallback.diagnostic || "",
          };
        }
      } else if (fallback.diagnostic) {
        diagnostics.push(fallback.diagnostic);
      }
    }

    if (best.objects.length && genericMethodAvailable) {
      try {
        var generic = await fetchViaGenericObjectMethods(api);
        if (generic.objects.length) {
          best = {
            objects: mergeUniqueObjects(best.objects, generic.objects),
            diagnostic: best.diagnostic || generic.diagnostic || "",
          };
        }
      } catch (error) {
        diagnostics.push(
          "Build " +
            BUILD_ID +
            ": Bred property-hydrering feilet: " +
            getErrorMessage(error),
        );
      }
    }

    if (
      best.objects.length &&
      typeof api.makeApiRequest === "function" &&
      typeof api.getProjectId === "function" &&
      typeof api.getBuildingId === "function"
    ) {
      try {
        best.objects = await hydrateMissingRulePropertiesViaRawIfc(
          api,
          specs,
          best.objects,
        );
      } catch (error) {
        diagnostics.push(
          "Build " +
            BUILD_ID +
            ": Raa property-hydrering feilet: " +
            getErrorMessage(error),
        );
      }
    }

    if (best.objects.length) {
      return best;
    }

    if (genericMethodAvailable) {
      return fetchViaGenericObjectMethods(api);
    }

    return {
      objects: [],
      diagnostic:
        diagnostics.filter(Boolean).slice(0, 5).join(" | ") ||
        "Build " +
          BUILD_ID +
          ": Widgeten fant ingen IDS-treff via StreamBIM-sok, og denne prosjektkonfigurasjonen tilbyr ingen fullmodell-metode for widgeter.",
    };
  }

  async function fetchViaApplicabilitySearch(api, specs) {
    var searches = buildApplicabilitySearches(specs);
    var seedSearches = buildApplicabilitySeedSearches(specs);
    var identities = {};
    var objects = [];
    var diagnostics = [];

    if (!searches.length && !seedSearches.length) {
      return {
        objects: [],
        diagnostic:
          "Build " +
          BUILD_ID +
          ": IDS-applicability ga ingen konkrete property-sok. Verken eksakte verdier eller faste property-navn kunne utledes fra IDS-filen.",
      };
    }

    for (var i = 0; i < searches.length; i += 1) {
      var queryResult = await runFindObjectsQueries(api, searches[i]);
      var candidates = extractObjectsFromResponse(queryResult.response);

      if (!candidates.length && queryResult.diagnostic) {
        diagnostics.push(queryResult.diagnostic);
      }

      for (var j = 0; j < candidates.length; j += 1) {
        var hydrated = await bestEffortGetObjectInfo(api, candidates[j]);
        storeApplicableObject(
          identities,
          objects,
          mergeObjectPayloads(candidates[j], hydrated),
          searches[i],
        );
      }
    }

    if (!objects.length) {
      for (var k = 0; k < seedSearches.length; k += 1) {
        var seedResult = await runFindObjectsQueries(api, seedSearches[k]);
        var seedCandidates = extractObjectsFromResponse(seedResult.response);

        if (!seedCandidates.length && seedResult.diagnostic) {
          diagnostics.push(seedResult.diagnostic);
        }

        for (var l = 0; l < seedCandidates.length; l += 1) {
          var seedHydrated = await bestEffortGetObjectInfo(
            api,
            seedCandidates[l],
          );
          storeApplicableObject(
            identities,
            objects,
            mergeObjectPayloads(seedCandidates[l], seedHydrated),
            seedSearches[k],
          );
        }
      }
    }

    return {
      objects: normalizeObjects(objects).objects,
      diagnostic: diagnostics.slice(0, 3).join(" | "),
    };
  }

  async function fetchViaFindObjects(api) {
    var pageSize = 200;
    var skip = 0;
    var pageIndex = 0;
    var allItems = [];
    var lastSignature = "";
    var errors = [];

    while (pageIndex < 100) {
      try {
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
            sort: { field: "ID", descending: false },
          },
          {
            filter: { key: "ID", value: "" },
            page: { limit: pageSize, skip: skip },
            sort: { field: "ID", descending: false },
          },
          {
            filter: { key: "Name", value: "" },
            limit: pageSize,
            skip: skip,
          },
          {
            filter: { key: "ID", value: "" },
            limit: pageSize,
            skip: skip,
          },
        ]);
        var pageItems = extractObjectsFromResponse(response);
        if (!pageItems.length) {
          break;
        }

        var signature = buildPageSignature(pageItems);
        if (pageIndex > 0 && signature && signature === lastSignature) {
          break;
        }

        allItems = allItems.concat(pageItems);
        lastSignature = signature;
        if (pageItems.length < pageSize) {
          break;
        }

        skip += pageSize;
        pageIndex += 1;
      } catch (error) {
        errors.push(getErrorMessage(error));
        break;
      }
    }

    if (!allItems.length) {
      return {
        objects: [],
        diagnostic:
          "Build " +
          BUILD_ID +
          ": Generell findObjects-fallback returnerte ingen objekter via tomt Name/ID-sok" +
          (errors.length
            ? " (siste feil: " + errors[errors.length - 1] + ")"
            : "."),
      };
    }

    var hydrated = await hydrateObjects(api, allItems);
    var uniqueObjects = [];
    var seen = {};

    for (var i = 0; i < hydrated.length; i += 1) {
      var identity =
        buildObjectIdentity(hydrated[i]) ||
        JSON.stringify(hydrated[i]).slice(0, 120);
      if (!identity || seen[identity]) {
        continue;
      }
      seen[identity] = true;
      uniqueObjects.push(hydrated[i]);
    }

    return {
      objects: normalizeObjects(uniqueObjects).objects,
      diagnostic: "",
    };
  }

  async function fetchViaRawIfcSearch(api, specs) {
    var searches = buildApplicabilitySearches(specs).concat(
      buildApplicabilitySeedSearches(specs),
    );
    var identities = {};
    var objects = [];
    var diagnostics = [];
    var context = await createRawIfcApiContext(api);

    if (!searches.length) {
      return {
        objects: [],
        diagnostic:
          "Build " +
          BUILD_ID +
          ": IDS-applicability ga ingen konkrete property-sok for raa IFC API.",
      };
    }

    if (!context.apiBase) {
      return {
        objects: [],
        diagnostic:
          "Build " +
          BUILD_ID +
          ": Klarte ikke etablere prosjektsti for raa IFC API-sok.",
      };
    }

    for (var i = 0; i < searches.length; i += 1) {
      var queryResult = await runRawIfcApiSearch(api, context, searches[i]);
      var guids = extractGuidsFromExportResponse(queryResult.response);

      if (!guids.length && queryResult.diagnostic) {
        diagnostics.push(queryResult.diagnostic);
      }

      for (var j = 0; j < guids.length; j += 1) {
        var guid = stringifyValue(guids[j]);
        var hydrated = await bestEffortGetObjectInfo(api, guids[j]);
        storeApplicableObject(
          identities,
          objects,
          mergeObjectPayloads({ guid: guid }, hydrated),
          searches[i],
          guid,
        );
      }
    }

    if (!objects.length) {
      return {
        objects: [],
        diagnostic:
          "Build " +
          BUILD_ID +
          ": Raa IFC API-sok returnerte ingen objektdata" +
          (diagnostics.length ? " (" + diagnostics.slice(-1)[0] + ")" : "."),
      };
    }

    return {
      objects: normalizeObjects(objects).objects,
      diagnostic: "",
    };
  }

  async function fetchViaGenericObjectMethods(api) {
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
        "Build " +
          BUILD_ID +
          ": Fant ingen StreamBIM-metode for å lese modellobjekter. Tilgjengelige metoder: " +
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
      return { objects: normalized.objects };
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

  async function hydrateMissingRulePropertiesViaRawIfc(api, specs, objects) {
    var context = await createRawIfcApiContext(api);
    if (!context.apiBase) {
      return objects;
    }

    var relevantRules = collectRelevantPropertyRules(specs);
    if (!relevantRules.length) {
      return objects;
    }

    var cache = {};
    var hydrated = [];

    for (var i = 0; i < objects.length; i += 1) {
      var object = objects[i];
      if (!objectNeedsRuleHydration(object, relevantRules)) {
        hydrated.push(object);
        continue;
      }

      var guid = pickFirst(object || {}, [
        "guid",
        "globalId",
        "ifcGuid",
        "GlobalId",
      ]);
      if (!guid) {
        hydrated.push(object);
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(cache, guid)) {
        cache[guid] = await fetchRawObjectByGuid(api, context, guid);
      }

      if (cache[guid]) {
        var rawPropertySets = extractPropertySets(cache[guid]);
        hydrated.push(
          Object.assign({}, mergeObjectPayloads(object, cache[guid]), {
            propertySets: mergePropertySets(
              object.propertySets,
              rawPropertySets,
            ),
          }),
        );
        continue;
      }

      hydrated.push(object);
    }

    return hydrated;
  }

  function collectRelevantPropertyRules(specs) {
    var seen = {};
    var rules = [];

    coerceArray(specs).forEach(function (spec) {
      coerceArray(spec && spec.applicability)
        .concat(coerceArray(spec && spec.requirements))
        .forEach(function (rule) {
          if (!rule || !rule.propertySet || !rule.baseName) {
            return;
          }
          var key = [rule.propertySet, rule.baseName].join("::");
          if (seen[key]) {
            return;
          }
          seen[key] = true;
          rules.push(rule);
        });
    });

    return rules;
  }

  function objectNeedsRuleHydration(object, rules) {
    return coerceArray(rules).some(function (rule) {
      return !hasReadableValue(
        getPropertyValue(object, rule.propertySet, rule.baseName),
      );
    });
  }

  async function fetchRawObjectByGuid(api, context, guid) {
    var variants = buildGuidSearchRuleVariants(context.buildingId, guid);

    for (var i = 0; i < variants.length; i += 1) {
      try {
        var createResponse = await makeApiJsonRequest(api, {
          url: context.apiBase + "/ifc-searches",
          method: "POST",
          accept: "application/json",
          contentType: "application/json",
          body: { rules: [[variants[i]]] },
        });

        var directItems = extractObjectsFromResponse(createResponse);
        for (var j = 0; j < directItems.length; j += 1) {
          if (Object.keys(extractPropertySets(directItems[j])).length) {
            return directItems[j];
          }
        }

        var searchId = extractSearchId(createResponse);
        if (!searchId) {
          continue;
        }

        var exportRequests = buildRawGuidExportRequests(
          context.apiBase,
          searchId,
        );
        for (var k = 0; k < exportRequests.length; k += 1) {
          try {
            var exportResponse = await makeApiJsonRequest(api, {
              url: exportRequests[k].url,
              method: "GET",
              accept: "application/json",
            });
            var exportItems = extractObjectsFromResponse(exportResponse);
            for (var m = 0; m < exportItems.length; m += 1) {
              if (
                normalizeComparisonText(
                  firstNonEmpty([
                    exportItems[m] && exportItems[m].GUID,
                    exportItems[m] && exportItems[m].guid,
                    exportItems[m] && exportItems[m].GlobalId,
                    exportItems[m] && exportItems[m].globalId,
                    buildObjectIdentity(exportItems[m]),
                  ]),
                ) === normalizeComparisonText(guid)
              ) {
                return exportItems[m];
              }
            }
          } catch (error) {}
        }
      } catch (error) {}
    }

    return null;
  }

  function buildGuidSearchRuleVariants(buildingId, guid) {
    var variants = [
      compactObject({
        buildingId: buildingId,
        propKey: "GUID",
        propValue: guid,
        operator: "=",
      }),
      compactObject({
        buildingId: buildingId,
        propKey: "GlobalId",
        propValue: guid,
        operator: "=",
      }),
      compactObject({
        buildingId: buildingId,
        propKey: "ifcGuid",
        propValue: guid,
        operator: "=",
      }),
    ];

    var seen = {};
    return variants.filter(function (variant) {
      var key = JSON.stringify(variant);
      if (seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function buildRawGuidExportRequests(apiBase, searchId) {
    var encodedSearchId = encodeURIComponent(searchId);
    return [
      {
        key: "plain-export",
        url:
          apiBase +
          "/ifc-searches/export/json?searchId=" +
          encodedSearchId +
          "&page[limit]=1000&page[skip]=0",
      },
      {
        key: "basic-fields",
        url:
          apiBase +
          "/ifc-searches/export/json?searchId=" +
          encodedSearchId +
          "&fieldNames=" +
          encodeURIComponent(base64Encode("GUID|Name")) +
          "&page[limit]=1000&page[skip]=0",
      },
    ];
  }

  function addApplicabilitySearch(searchMap, target, search) {
    if (!search || !search.propertyName) {
      return;
    }

    var key = [
      search.propertySet || "",
      search.propertyName || "",
      typeof search.value === "undefined" ? "" : stringifyValue(search.value),
      search.isSeedSearch ? "seed" : "exact",
    ].join("::");

    if (!searchMap[key]) {
      searchMap[key] = {
        propertySet: search.propertySet || "",
        propertyName: search.propertyName || "",
        value:
          typeof search.value === "undefined"
            ? ""
            : stringifyValue(search.value),
        isSeedSearch: !!search.isSeedSearch,
        specNames: uniqueStrings(search.specNames || []),
      };
      target.push(searchMap[key]);
      return;
    }

    searchMap[key].specNames = uniqueStrings(
      coerceArray(searchMap[key].specNames).concat(
        coerceArray(search.specNames),
      ),
    );
  }

  function buildApplicabilitySearches(specs) {
    var searchMap = {};
    var searches = [];

    specs.forEach(function (spec) {
      (spec.applicability || []).forEach(function (rule) {
        buildSearchValues(rule.valueRule).forEach(function (searchValue) {
          if (!rule.baseName || !searchValue) {
            return;
          }

          addApplicabilitySearch(searchMap, searches, {
            propertySet: rule.propertySet || "",
            propertyName: rule.baseName,
            value: searchValue,
            specNames: [spec.name],
          });
        });
      });
    });

    return searches;
  }

  function buildApplicabilitySeedSearches(specs) {
    var searchMap = {};
    var searches = [];
    var fallbackSearches = [];

    specs.forEach(function (spec) {
      var specHasConcreteApplicability = false;

      (spec.applicability || []).forEach(function (rule) {
        if (!rule.baseName) {
          return;
        }

        specHasConcreteApplicability = true;
        addApplicabilitySearch(searchMap, searches, {
          propertySet: rule.propertySet || "",
          propertyName: rule.baseName,
          value: "",
          isSeedSearch: true,
          specNames: [spec.name],
        });
      });

      if (specHasConcreteApplicability) {
        return;
      }

      (spec.requirements || []).forEach(function (rule) {
        if (!rule.baseName) {
          return;
        }

        addApplicabilitySearch(searchMap, fallbackSearches, {
          propertySet: rule.propertySet || "",
          propertyName: rule.baseName,
          value: "",
          isSeedSearch: true,
          specNames: [spec.name],
        });
      });
    });

    return searches.concat(fallbackSearches.slice(0, 8));
  }

  function buildSearchValues(valueRule) {
    if (!valueRule) {
      return [];
    }
    if (valueRule.type === "equals") {
      return [stringifyValue(valueRule.value).trim()].filter(Boolean);
    }
    if (valueRule.type === "oneOf") {
      return uniqueStrings(
        (valueRule.values || [])
          .map(function (value) {
            return stringifyValue(value).trim();
          })
          .filter(Boolean),
      );
    }
    return [];
  }

  async function runFindObjectsQueries(api, search) {
    var candidateKeys = buildSearchKeys(
      search.propertySet,
      search.propertyName,
    );

    for (var i = 0; i < candidateKeys.length; i += 1) {
      var key = candidateKeys[i];
      var argumentVariants = [
        { key: key, value: search.value, limit: 1000, skip: 0 },
        { key: key, value: search.value, limit: 1000 },
        { key: key, value: search.value },
        {
          filter: { key: key, value: search.value },
          page: { limit: 1000, skip: 0 },
          sort: { field: "ID", descending: false },
        },
        {
          filter: { key: key, value: search.value },
          page: { limit: 1000, skip: 0 },
        },
        { filter: { key: key, value: search.value }, limit: 1000, skip: 0 },
        { filter: { key: key, value: search.value }, limit: 1000 },
        { filter: { key: key, value: search.value } },
      ];

      if (search.isSeedSearch) {
        argumentVariants = argumentVariants.concat([
          { key: key, limit: 1000, skip: 0 },
          { key: key, limit: 1000 },
          { key: key },
          {
            filter: { key: key },
            page: { limit: 1000, skip: 0 },
            sort: { field: "ID", descending: false },
          },
          { filter: { key: key }, page: { limit: 1000, skip: 0 } },
          { filter: { key: key }, limit: 1000, skip: 0 },
          { filter: { key: key }, limit: 1000 },
          { filter: { key: key } },
        ]);
      }

      try {
        var response = await invokeMethodGuessing(
          api,
          "findObjects",
          argumentVariants,
        );
        if (extractObjectsFromResponse(response).length) {
          return {
            response: response,
            diagnostic: "",
            matchedKey: key,
          };
        }
      } catch (error) {}
    }

    return {
      response: [],
      diagnostic:
        "Ingen treff for " +
        search.propertySet +
        "." +
        search.propertyName +
        "=" +
        (search.value === "" ? "<tomt sok>" : search.value) +
        ". Provde nokler: " +
        candidateKeys.join(", "),
      matchedKey: "",
    };
  }

  function buildSearchKeys(propertySet, propertyName) {
    var propertySetVariants = uniqueStrings([
      propertySet,
      stripSchemaSuffix(propertySet),
    ]).filter(Boolean);
    var propertyNameVariants = uniqueStrings([
      propertyName,
      stripSchemaSuffix(propertyName),
    ]).filter(Boolean);
    var keys = [];

    propertySetVariants.forEach(function (propertySetVariant) {
      propertyNameVariants.forEach(function (propertyNameVariant) {
        keys.push(propertySetVariant + "~" + propertyNameVariant);
        keys.push(propertySetVariant + "." + propertyNameVariant);
        keys.push(propertySetVariant + ":" + propertyNameVariant);
        keys.push(propertySetVariant + "/" + propertyNameVariant);
        keys.push(propertySetVariant + ">" + propertyNameVariant);
        keys.push(propertySetVariant + " - " + propertyNameVariant);
      });
    });

    return uniqueStrings(keys.concat(propertyNameVariants)).filter(Boolean);
  }

  function stripSchemaSuffix(value) {
    return String(value || "")
      .trim()
      .replace(/_\d+$/g, "");
  }

  async function hydrateObjects(api, objects) {
    if (
      !api ||
      (typeof api.getObjectInfo !== "function" &&
        typeof api.getObjectInfoForSearch !== "function")
    ) {
      return objects;
    }

    var hydrated = [];
    for (var i = 0; i < objects.length; i += 1) {
      var detail = await bestEffortGetObjectInfo(api, objects[i]);
      hydrated.push(mergeObjectPayloads(objects[i], detail));
    }
    return hydrated;
  }

  async function bestEffortGetObjectInfoForSearch(api, object) {
    if (!api || typeof api.getObjectInfoForSearch !== "function") {
      return null;
    }

    var guid = pickFirst(object || {}, [
      "guid",
      "globalId",
      "ifcGuid",
      "GlobalId",
    ]);
    var id = pickFirst(object || {}, ["id", "objectId", "dbId", "expressId"]);
    var buildingId = await resolveSearchBuildingId(api, object);
    var queries = buildObjectInfoForSearchQueries(buildingId, guid, id);

    for (var i = 0; i < queries.length; i += 1) {
      try {
        var response = await api.getObjectInfoForSearch(queries[i]);
        var matched = selectBestMatchingObjectFromResponse(
          response,
          guid,
          id,
          object,
        );
        if (matched) {
          return matched;
        }
      } catch (error) {}
    }

    return null;
  }

  async function bestEffortGetObjectInfo(api, object) {
    var searchedDetail = await bestEffortGetObjectInfoForSearch(api, object);
    if (searchedDetail) {
      var searchedMerged = mergeObjectPayloads(object, searchedDetail);
      if (Object.keys(extractPropertySets(searchedMerged)).length) {
        return searchedMerged;
      }
      object = searchedMerged;
    }

    var candidates = [];
    var guid = pickFirst(object || {}, [
      "guid",
      "globalId",
      "ifcGuid",
      "GlobalId",
    ]);
    var id = pickFirst(object || {}, ["id", "objectId", "dbId", "expressId"]);

    if (guid) {
      candidates.push(guid);
    }
    if (id && id !== guid) {
      candidates.push(id);
    }
    candidates.push(object);

    for (var i = 0; i < candidates.length; i += 1) {
      try {
        if (typeof api.getObjectInfo !== "function") {
          break;
        }
        var detail = normalizeObjectPayload(
          await api.getObjectInfo(candidates[i]),
        );
        return await hydrateObjectPropertiesIfNeeded(api, object, detail);
      } catch (error) {}
    }

    if (guid) {
      var resolved = await resolveObjectCandidateByGuid(api, guid);
      if (resolved) {
        var resolvedId = pickFirst(resolved || {}, [
          "id",
          "objectId",
          "dbId",
          "expressId",
        ]);
        var resolvedGuid = pickFirst(resolved || {}, [
          "guid",
          "globalId",
          "ifcGuid",
          "GlobalId",
        ]);
        var resolvedCandidates = [];

        if (resolvedId) {
          resolvedCandidates.push(resolvedId);
        }
        if (resolvedGuid && resolvedGuid !== resolvedId) {
          resolvedCandidates.push(resolvedGuid);
        }
        resolvedCandidates.push(resolved);

        for (var j = 0; j < resolvedCandidates.length; j += 1) {
          try {
            if (typeof api.getObjectInfo !== "function") {
              break;
            }
            var resolvedDetail = normalizeObjectPayload(
              await api.getObjectInfo(resolvedCandidates[j]),
            );
            return await hydrateObjectPropertiesIfNeeded(
              api,
              mergeObjectPayloads(object, resolved),
              mergeObjectPayloads(resolved, resolvedDetail),
            );
          } catch (error) {}
        }
      }
    }

    return await hydrateObjectPropertiesIfNeeded(api, object, object);
  }

  async function hydrateObjectPropertiesIfNeeded(
    api,
    baseObject,
    detailObject,
  ) {
    var merged = mergeObjectPayloads(
      normalizeObjectPayload(baseObject),
      normalizeObjectPayload(detailObject),
    );
    if (Object.keys(extractPropertySets(merged)).length) {
      return merged;
    }

    var propertyMethod = firstAvailableMethod(api, [
      "getObjectProperties",
      "getProperties",
      "getPropertiesForObject",
      "getItemProperties",
      "getObjectById",
    ]);
    if (!propertyMethod) {
      return merged;
    }

    var guid = pickFirst(merged || {}, [
      "guid",
      "globalId",
      "ifcGuid",
      "GlobalId",
    ]);
    var id = pickFirst(merged || {}, ["id", "objectId", "dbId", "expressId"]);
    var candidates = [];

    if (guid) {
      candidates.push({ guid: guid });
    }
    if (id) {
      candidates.push({ id: id });
    }
    if (guid) {
      candidates.push(guid);
    }
    if (id && id !== guid) {
      candidates.push(id);
    }
    candidates.push(merged);

    try {
      var propertyPayload = await invokeMethodGuessing(
        api,
        propertyMethod,
        candidates,
      );
      return mergeObjectPayloads(merged, propertyPayload);
    } catch (error) {
      return merged;
    }
  }

  async function resolveObjectCandidateByGuid(api, guid) {
    if (!api || typeof api.findObjects !== "function" || !guid) {
      return null;
    }

    try {
      var response = await invokeMethodGuessing(api, "findObjects", [
        {
          key: "GlobalId",
          value: guid,
          page: { limit: 1, skip: 0 },
        },
        {
          key: "GUID",
          value: guid,
          page: { limit: 1, skip: 0 },
        },
        {
          filter: { key: "GlobalId", value: guid },
          page: { limit: 1, skip: 0 },
        },
        {
          filter: { key: "GUID", value: guid },
          page: { limit: 1, skip: 0 },
        },
      ]);
      var candidates = extractObjectsFromResponse(response);
      if (candidates.length) {
        return candidates[0];
      }
    } catch (error) {}

    return null;
  }

  function mergeObjectPayloads(baseObject, detailObject) {
    if (!detailObject || detailObject === baseObject) {
      return baseObject;
    }

    var merged = Object.assign({}, baseObject || {}, detailObject || {});
    var mergeKeys = [
      "propertySets",
      "psets",
      "properties",
      "propertySetData",
      "data",
    ];

    mergeKeys.forEach(function (key) {
      var left = baseObject && baseObject[key];
      var right = detailObject && detailObject[key];

      if (Array.isArray(left) || Array.isArray(right)) {
        merged[key] = coerceArray(left).concat(coerceArray(right));
        return;
      }

      if (
        left &&
        right &&
        typeof left === "object" &&
        typeof right === "object"
      ) {
        merged[key] = Object.assign({}, left, right);
      }
    });

    var applicableSpecs = uniqueStrings(
      coerceArray(
        baseObject &&
          (baseObject._idsApplicableSpecs || baseObject.idsApplicableSpecs),
      ).concat(
        coerceArray(
          detailObject &&
            (detailObject._idsApplicableSpecs ||
              detailObject.idsApplicableSpecs),
        ),
      ),
    );

    if (applicableSpecs.length) {
      merged._idsApplicableSpecs = applicableSpecs;
      merged.idsApplicableSpecs = applicableSpecs.slice();
    }

    return merged;
  }

  function applyApplicabilityHints(object, search) {
    if (!object || !search) {
      return object;
    }

    var applicableSpecs = uniqueStrings(
      coerceArray(
        object._idsApplicableSpecs || object.idsApplicableSpecs,
      ).concat(coerceArray(search.specNames)),
    );

    if (!applicableSpecs.length) {
      return object;
    }

    return Object.assign({}, object, {
      _idsApplicableSpecs: applicableSpecs,
      idsApplicableSpecs: applicableSpecs.slice(),
    });
  }

  function storeApplicableObject(
    identities,
    objects,
    object,
    search,
    fallbackIdentity,
  ) {
    if (!object) {
      return;
    }

    var hintedObject = applyApplicabilityHints(object, search);
    var identity =
      buildObjectIdentity(hintedObject) || stringifyValue(fallbackIdentity);
    if (!identity) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(identities, identity)) {
      objects[identities[identity]] = mergeObjectPayloads(
        objects[identities[identity]],
        hintedObject,
      );
      return;
    }

    identities[identity] = objects.length;
    objects.push(hintedObject);
  }

  function buildObjectIdentity(object) {
    if (!object || typeof object !== "object") {
      return "";
    }

    return (
      pickFirst(object, ["guid", "globalId", "ifcGuid", "GlobalId"]) ||
      pickFirst(object, ["id", "objectId", "dbId", "expressId"]) ||
      pickFirst(object, ["name", "label", "title", "displayName", "Name"])
    );
  }

  function normalizeIdentityToken(value) {
    return String(value || "")
      .trim()
      .replace(/^T~/, "");
  }

  function normalizeObjectPayload(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return source;
    }

    var normalized = source;

    if (
      normalized.data &&
      typeof normalized.data === "object" &&
      !Array.isArray(normalized.data)
    ) {
      normalized = Object.assign({}, normalized.data, {
        _jsonApiDocument: source,
      });
    }

    if (normalized.attributes && typeof normalized.attributes === "object") {
      normalized = Object.assign({}, normalized.attributes, normalized);
    }

    if (!normalized.properties && normalized.attributes) {
      normalized.properties = normalized.attributes.properties || {};
    }

    if (!normalized.guid) {
      normalized.guid =
        pickFirst(normalized, ["globalId", "ifcGuid", "GlobalId"]) ||
        pickFirst(normalized.properties || {}, [
          "Global Id",
          "GlobalId",
          "GUID",
          "guid",
        ]) ||
        "";
    }

    if (!normalized.name) {
      normalized.name = pickFirst(normalized, [
        "label",
        "title",
        "displayName",
        "Name",
      ]);
    }

    return normalized;
  }

  function extractObjectsFromResponse(response) {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response.map(normalizeObjectPayload);
    }

    var candidates = [
      response.items,
      response.objects,
      response.results,
      response.rows,
      response.data,
      response.guids,
      response.result,
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      if (Array.isArray(candidates[i])) {
        return candidates[i].map(normalizeObjectPayload);
      }
      if (candidates[i] && typeof candidates[i] === "object") {
        return [normalizeObjectPayload(candidates[i])];
      }
    }

    if (response && typeof response === "object") {
      return [normalizeObjectPayload(response)];
    }

    return [];
  }

  function extractGuidsFromResponse(response) {
    return extractObjectsFromResponse(response)
      .map(function (item) {
        if (typeof item === "string") {
          return item;
        }
        return buildObjectIdentity(item);
      })
      .filter(Boolean);
  }

  function extractGuidsFromExportResponse(response) {
    return uniqueStrings(
      extractObjectsFromResponse(response)
        .map(function (item) {
          if (typeof item === "string") {
            return item;
          }
          return firstNonEmpty([
            item.GUID,
            item.guid,
            item.GlobalId,
            item.globalId,
            item.ifcGuid,
            buildObjectIdentity(item),
          ]);
        })
        .filter(Boolean),
    );
  }

  function buildPageSignature(items) {
    return items
      .slice(0, 10)
      .map(function (item) {
        return buildObjectIdentity(item) || JSON.stringify(item).slice(0, 80);
      })
      .join("|");
  }

  async function createRawIfcApiContext(api) {
    var projectId = "";
    var buildingId = "1000";

    try {
      projectId = stringifyValue(await api.getProjectId()).trim();
    } catch (error) {}

    try {
      var resolvedBuildingId = stringifyValue(await api.getBuildingId()).trim();
      if (resolvedBuildingId) {
        buildingId = resolvedBuildingId;
      }
    } catch (error) {}

    return {
      projectId: projectId,
      buildingId: buildingId,
      apiBase: buildRawIfcApiBase(projectId),
    };
  }

  function buildRawIfcApiBase(projectId) {
    var cleanedProjectId = String(projectId || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");

    if (!cleanedProjectId) {
      return "";
    }

    if (/^project-\d+$/i.test(cleanedProjectId)) {
      return "/" + cleanedProjectId + "/api/v1";
    }

    if (/^\d+$/.test(cleanedProjectId)) {
      return "/project-" + cleanedProjectId + "/api/v1";
    }

    return "/" + cleanedProjectId + "/api/v1";
  }

  async function runRawIfcApiSearch(api, context, search) {
    var errors = [];
    var ruleVariants = buildRawIfcApiRuleVariants(context.buildingId, search);

    for (var i = 0; i < ruleVariants.length; i += 1) {
      try {
        var createResponse = await makeApiJsonRequest(api, {
          url: context.apiBase + "/ifc-searches",
          method: "POST",
          accept: "application/json",
          contentType: "application/json",
          body: { rules: [[ruleVariants[i]]] },
        });
        var directGuids = extractGuidsFromResponse(createResponse);
        if (directGuids.length) {
          return {
            response: directGuids,
            diagnostic: "",
          };
        }

        var searchId = extractSearchId(createResponse);
        if (!searchId) {
          continue;
        }

        var resultCount = extractSearchResultCount(createResponse);
        if (resultCount === 0) {
          continue;
        }

        var exportRequests = buildRawIfcExportRequests(
          context.apiBase,
          searchId,
        );
        for (var j = 0; j < exportRequests.length; j += 1) {
          try {
            var exportResponse = await makeApiJsonRequest(api, {
              url: exportRequests[j].url,
              method: "GET",
              accept: "application/json",
            });
            var exportGuids = extractGuidsFromExportResponse(exportResponse);

            if (exportGuids.length) {
              state.streamBim.rawIfcExportVariant = exportRequests[j].key;
              return {
                response: exportResponse,
                diagnostic: "",
              };
            }
          } catch (error) {
            errors.push(getErrorMessage(error));

            if (
              state.streamBim.rawIfcExportVariant === exportRequests[j].key &&
              resultCount > 0
            ) {
              state.streamBim.rawIfcExportVariant = "";
            }
          }
        }
      } catch (error) {
        errors.push(getErrorMessage(error));
      }
    }

    return {
      response: [],
      diagnostic:
        "Raa IFC API fant ingen treff for " +
        search.propertySet +
        "." +
        search.propertyName +
        "=" +
        (search.value === "" ? "<tomt sok>" : search.value) +
        (errors.length
          ? " (siste feil: " + errors[errors.length - 1] + ")"
          : ""),
    };
  }

  function buildRawIfcApiRuleVariants(buildingId, search) {
    var variants = [];
    var candidateKeys = buildSearchKeys(
      search.propertySet,
      search.propertyName,
    );

    if (search.propertySet && search.propertyName) {
      variants.push(
        compactObject({
          buildingId: buildingId,
          psetName: search.propertySet,
          propKey: search.propertyName,
          propValue: search.value,
          operator: "=",
        }),
      );
      variants.push(
        compactObject({
          buildingId: buildingId,
          psetName: search.propertySet,
          propKey: search.propertyName,
          operator: "=",
        }),
      );
    }

    candidateKeys.forEach(function (candidateKey) {
      variants.push(
        compactObject({
          buildingId: buildingId,
          propKey: candidateKey,
          propValue: search.value,
          operator: "=",
        }),
      );
      variants.push(
        compactObject({
          buildingId: buildingId,
          propKey: candidateKey,
          operator: "=",
        }),
      );
    });

    var seen = {};
    return variants.filter(function (variant) {
      var key = JSON.stringify(variant);
      if (seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function buildRawIfcExportRequests(apiBase, searchId) {
    var encodedSearchId = encodeURIComponent(searchId);
    var officialFieldNames = encodeURIComponent(
      base64Encode("GUID|Name|Long Name|Description"),
    );
    var basicFieldNames = encodeURIComponent(base64Encode("GUID|Name"));
    var requests = [
      {
        key: "official-field-union",
        url:
          apiBase +
          "/ifc-searches/export/json?searchId=" +
          encodedSearchId +
          "&fieldUnion=true&fieldNames=" +
          officialFieldNames +
          "&page[limit]=1000&page[skip]=0",
      },
      {
        key: "basic-fields",
        url:
          apiBase +
          "/ifc-searches/export/json?searchId=" +
          encodedSearchId +
          "&fieldNames=" +
          basicFieldNames +
          "&page[limit]=1000&page[skip]=0",
      },
      {
        key: "plain-export",
        url:
          apiBase +
          "/ifc-searches/export/json?searchId=" +
          encodedSearchId +
          "&page[limit]=1000&page[skip]=0",
      },
    ];
    var preferredKey = state.streamBim.rawIfcExportVariant || "";

    if (!preferredKey) {
      return requests;
    }

    return requests.filter(function (request) {
      return request.key === preferredKey;
    });
  }

  function extractSearchResultCount(response) {
    var rawCount = firstDefined([
      response && response.resultCount,
      response && response.totalCount,
      response && response.count,
      response && response.total,
      response && response.matches,
      response && response.data && response.data.resultCount,
      response && response.data && response.data.totalCount,
      response && response.data && response.data.count,
      response && response.data && response.data.total,
      response &&
        response.data &&
        response.data.attributes &&
        response.data.attributes.resultCount,
      response &&
        response.data &&
        response.data.attributes &&
        response.data.attributes.totalCount,
      response &&
        response.data &&
        response.data.attributes &&
        response.data.attributes.count,
      response && response.meta && response.meta.resultCount,
      response && response.meta && response.meta.totalCount,
      response && response.meta && response.meta.count,
    ]);

    if (
      rawCount === null ||
      typeof rawCount === "undefined" ||
      rawCount === ""
    ) {
      return -1;
    }

    var parsed = Number(rawCount);
    if (!isFinite(parsed)) {
      return -1;
    }

    return parsed;
  }

  async function makeApiJsonRequest(api, request) {
    var rawResponse = await api.makeApiRequest(request);
    if (!rawResponse) {
      return {};
    }
    if (typeof rawResponse === "string") {
      try {
        return JSON.parse(rawResponse);
      } catch (error) {
        return { raw: rawResponse };
      }
    }
    return rawResponse;
  }

  function extractSearchId(response) {
    return firstNonEmpty([
      response && response.searchId,
      response && response.id,
      response && response.data && response.data.searchId,
      response && response.data && response.data.id,
    ]);
  }

  function base64Encode(value) {
    if (typeof btoa === "function") {
      return btoa(value);
    }
    return value;
  }

  function firstAvailableMethod(api, candidates) {
    for (var i = 0; i < candidates.length; i += 1) {
      if (api && typeof api[candidates[i]] === "function") {
        return candidates[i];
      }
    }
    return "";
  }

  function mergeUniqueObjects(left, right) {
    var merged = [];
    var seen = {};
    var allObjects = coerceArray(left).concat(coerceArray(right));

    allObjects.forEach(function (object) {
      var identity =
        buildObjectIdentity(object) ||
        JSON.stringify(object && (object.raw || object)).slice(0, 120);
      if (!identity) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(seen, identity)) {
        merged[seen[identity]] = mergeObjectPayloads(
          merged[seen[identity]],
          object,
        );
        return;
      }
      seen[identity] = merged.length;
      merged.push(object);
    });

    return merged;
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
      var scope = inferObjectScope(item, propertySets);
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
        modelName: scope.modelName,
        layerName: scope.layerName,
        scopeKey: scope.scopeKey,
        scopeLabel: scope.scopeLabel,
        propertySets: propertySets,
        idsApplicableSpecs: uniqueStrings(
          coerceArray(
            item._idsApplicableSpecs || item.idsApplicableSpecs || [],
          ),
        ),
        raw: item,
      });
    });

    return { objects: objects, haveProperties: haveProperties };
  }

  function extractPropertySets(source) {
    if (!source || typeof source !== "object") {
      return {};
    }

    var groupedPropertySets = mergePropertySets(
      extractPropertySetsFromGroups(
        source.attributes && source.attributes.groups,
      ),
      extractPropertySetsFromGroups(source.groups),
    );
    if (Object.keys(groupedPropertySets).length) {
      return groupedPropertySets;
    }

    var containers = [
      {
        value: source.attributes && source.attributes.propertySets,
        fallbackSetName: "",
        allowFlatMap: false,
      },
      {
        value: source.attributes && source.attributes.psets,
        fallbackSetName: "",
        allowFlatMap: false,
      },
      { value: source.propertySets, fallbackSetName: "", allowFlatMap: false },
      { value: source.psets, fallbackSetName: "", allowFlatMap: false },
      {
        value: source.attributes && source.attributes.properties,
        fallbackSetName: "__flat__",
        allowFlatMap: true,
      },
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

    return normalizePropertyContainer(source, "__flat__", true);
  }

  function extractPropertySetsFromGroups(groups) {
    if (!Array.isArray(groups) || !groups.length) {
      return {};
    }

    var propertySets = {};

    groups.forEach(function (group) {
      if (!group || typeof group !== "object") {
        return;
      }

      var setName =
        group.label ||
        group.name ||
        group.title ||
        group.propertySet ||
        group.propertySetName ||
        "Default";
      var content = group.content || group.data || group.attributes || {};
      var groupProperties = null;

      if (Array.isArray(content.properties)) {
        groupProperties = content.properties;
      } else if (Array.isArray(content.values)) {
        groupProperties = content.values;
      } else if (Array.isArray(group.properties)) {
        groupProperties = group.properties;
      } else if (Array.isArray(group.values)) {
        groupProperties = group.values;
      } else if (content.properties && typeof content.properties === "object") {
        groupProperties = content.properties;
      } else if (group.properties && typeof group.properties === "object") {
        groupProperties = group.properties;
      }

      var normalized = normalizeGroupProperties(groupProperties, setName);
      if (Object.keys(normalized).length) {
        propertySets = mergePropertySets(propertySets, normalized);
      }
    });

    return propertySets;
  }

  function normalizeGroupProperties(groupProperties, setName) {
    if (!groupProperties) {
      return {};
    }

    if (Array.isArray(groupProperties)) {
      var values = {};

      groupProperties.forEach(function (item) {
        if (!item || typeof item !== "object") {
          return;
        }

        var key =
          item.key || item.name || item.baseName || item.label || item.title;
        if (!key) {
          return;
        }

        values[key] = stringifyValue(
          firstDefined([
            item.value,
            item.nominalValue,
            item.displayValue,
            item.Value,
          ]),
        );
      });

      if (!Object.keys(values).length) {
        return {};
      }

      var result = {};
      result[setName || "Default"] = values;
      return result;
    }

    if (typeof groupProperties === "object") {
      var objectResult = {};
      objectResult[setName || "Default"] = flattenPropertyMap(groupProperties);
      return objectResult;
    }

    return {};
  }

  async function resolveSearchBuildingId(api, object) {
    var directBuildingId = stringifyValue(
      firstNonEmpty([
        pickFirst(object || {}, ["buildingId", "@Building Id"]),
        state.streamBim && state.streamBim.searchBuildingId,
      ]),
    ).trim();

    if (directBuildingId) {
      if (state.streamBim) {
        state.streamBim.searchBuildingId = directBuildingId;
      }
      return directBuildingId;
    }

    try {
      var buildingId = stringifyValue(await api.getBuildingId()).trim();
      if (buildingId) {
        state.streamBim.searchBuildingId = buildingId;
        return buildingId;
      }
    } catch (error) {}

    state.streamBim.searchBuildingId = "1000";
    return "1000";
  }

  function buildObjectInfoForSearchQueries(buildingId, guid, id) {
    var values = uniqueStrings([guid, id].filter(Boolean));
    var keys = ["GUID", "GlobalId", "Global Id", "ifcGuid"];
    var queries = [];

    values.forEach(function (value) {
      keys.forEach(function (key) {
        queries.push({
          filter: { key: key, value: value },
          page: { limit: 1, skip: 0 },
          fieldUnion: true,
        });
        queries.push({
          filter: {
            rules: [
              [
                compactObject({
                  buildingId: buildingId,
                  propKey: key,
                  propType: "str",
                  propValue: value,
                }),
              ],
            ],
          },
          page: { limit: 1, skip: 0 },
          fieldUnion: true,
        });
        queries.push({
          filter: {
            rules: [
              [
                compactObject({
                  buildingId: buildingId,
                  psetName: "",
                  propKey: key,
                  propType: "str",
                  propValue: value,
                }),
              ],
            ],
          },
          page: { limit: 1, skip: 0 },
          fieldUnion: true,
        });
      });
    });

    var seen = {};
    return queries.filter(function (query) {
      var signature = JSON.stringify(query);
      if (seen[signature]) {
        return false;
      }
      seen[signature] = true;
      return true;
    });
  }

  function selectBestMatchingObjectFromResponse(response, guid, id, fallback) {
    var objects = extractObjectsFromResponse(response);
    if (!objects.length) {
      return null;
    }

    var wanted = uniqueStrings(
      [guid, id, buildObjectIdentity(fallback)].filter(Boolean),
    )
      .map(normalizeIdentityToken)
      .filter(Boolean);

    if (!wanted.length) {
      return objects[0];
    }

    for (var i = 0; i < objects.length; i += 1) {
      var candidateTokens = uniqueStrings([
        buildObjectIdentity(objects[i]),
        pickFirst(objects[i], ["id", "objectId", "dbId", "expressId"]),
        pickFirst(objects[i], ["guid", "globalId", "ifcGuid", "GlobalId"]),
        pickFirst(objects[i].properties || {}, [
          "Global Id",
          "GlobalId",
          "GUID",
          "guid",
        ]),
      ])
        .map(normalizeIdentityToken)
        .filter(Boolean);

      for (var j = 0; j < candidateTokens.length; j += 1) {
        if (wanted.indexOf(candidateTokens[j]) !== -1) {
          return objects[i];
        }
      }
    }

    return objects[0];
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
      return normalizePropertyArray(container, fallbackSetName || "Default");
    }

    if (typeof container !== "object") {
      return {};
    }

    var propertySets = {};
    var flatValues = {};

    Object.keys(container).forEach(function (key) {
      var value = container[key];
      var compositeKey = splitCompositePropertyKey(key);

      if (isLikelyMetadataKey(key) && allowFlatMap) {
        return;
      }

      if (Array.isArray(value)) {
        propertySets = mergePropertySets(
          propertySets,
          normalizePropertyArray(value, key),
        );
        return;
      }

      if (value && typeof value === "object") {
        if (hasPropertyIdentity(value)) {
          var setName = fallbackSetName || "Default";
          propertySets[setName] = propertySets[setName] || {};
          propertySets[setName][value.name || value.baseName || key] =
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

        if (compositeKey) {
          var compositeValue = extractScalarPropertyValue(value);
          if (compositeValue !== null) {
            assignPropertyValue(
              propertySets,
              compositeKey.propertySet,
              compositeKey.propertyName,
              compositeValue,
            );
            if (allowFlatMap) {
              flatValues[key] = compositeValue;
            }
            return;
          }
        }

        propertySets[key] = flattenPropertyMap(value);
        return;
      }

      if (allowFlatMap) {
        var flatValue = stringifyValue(value);
        flatValues[key] = flatValue;
        if (compositeKey) {
          assignPropertyValue(
            propertySets,
            compositeKey.propertySet,
            compositeKey.propertyName,
            flatValue,
          );
        }
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
      var xsRestriction = valueEl.getElementsByTagNameNS(
        "http://www.w3.org/2001/XMLSchema",
        "restriction",
      )[0];
      if (xsRestriction) {
        restriction = xsRestriction;
      }
    }

    if (restriction) {
      var enumerationNodes = restriction.getElementsByTagNameNS(
        "http://www.w3.org/2001/XMLSchema",
        "enumeration",
      );
      if (enumerationNodes.length) {
        return {
          type: "oneOf",
          values: Array.prototype.slice
            .call(enumerationNodes)
            .map(function (node) {
              return node.getAttribute("value") || "";
            })
            .filter(Boolean),
        };
      }

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
    var scopesByKey = {};
    var scopeOrder = [];
    var groups = [];
    var passedChecks = 0;
    var failedChecks = 0;
    var applicableObjectCount = 0;
    var specStatusesByName = {};

    objects.forEach(function (object) {
      var scopeKey = object.scopeKey || "__default__";
      if (!scopesByKey[scopeKey]) {
        scopesByKey[scopeKey] = {
          scopeKey: scopeKey,
          scopeLabel: object.scopeLabel || "Uspesifisert modellag",
          modelName: object.modelName || "",
          layerName: object.layerName || "",
          objects: [],
        };
        scopeOrder.push(scopeKey);
      }
      scopesByKey[scopeKey].objects.push(object);
    });

    var scopes = scopeOrder
      .map(function (scopeKey) {
        return validateScope(specs, scopesByKey[scopeKey]);
      })
      .sort(function (a, b) {
        return b.summary.failedChecks - a.summary.failedChecks;
      });

    scopes.forEach(function (scope) {
      passedChecks += scope.summary.passedChecks;
      failedChecks += scope.summary.failedChecks;
      applicableObjectCount += scope.summary.applicableObjectCount;
      scope.groups.forEach(function (group) {
        group.globalIndex = groups.length;
        groups.push(group);
      });

      coerceArray(scope.specStatuses).forEach(function (specStatus) {
        var specName = specStatus.specName || "Ukjent spesifikasjon";
        if (!specStatusesByName[specName]) {
          specStatusesByName[specName] = {
            specName: specName,
            applicableObjects: {},
            passedChecks: 0,
            failedChecks: 0,
          };
        }

        Object.keys(specStatus.applicableObjects || {}).forEach(function (key) {
          specStatusesByName[specName].applicableObjects[key] = true;
        });
        specStatusesByName[specName].passedChecks +=
          specStatus.passedChecks || 0;
        specStatusesByName[specName].failedChecks +=
          specStatus.failedChecks || 0;
      });
    });

    var specStatuses = Object.keys(specStatusesByName)
      .map(function (specName) {
        var specStatus = specStatusesByName[specName];
        return {
          specName: specName,
          applicableObjectCount: Object.keys(specStatus.applicableObjects)
            .length,
          passedChecks: specStatus.passedChecks,
          failedChecks: specStatus.failedChecks,
        };
      })
      .sort(function (a, b) {
        if (b.failedChecks !== a.failedChecks) {
          return b.failedChecks - a.failedChecks;
        }
        return String(a.specName).localeCompare(String(b.specName));
      });

    return {
      groups: groups,
      scopes: scopes,
      specStatuses: specStatuses,
      summary: {
        objectCount: objects.length,
        objectCountUnique: countUniqueObjects(objects),
        scopeCount: scopes.length,
        specCount: specs.length,
        passedChecks: passedChecks,
        failedChecks: failedChecks,
        applicableObjectCount: applicableObjectCount,
      },
    };
  }

  function countUniqueObjects(objects) {
    var unique = {};
    coerceArray(objects).forEach(function (object) {
      unique[buildObjectIdentityKey(object)] = true;
    });
    return Object.keys(unique).length;
  }

  function buildObjectIdentityKey(object) {
    return String(
      (object && (object.guid || object.id || object.name || object.type)) ||
        "__unknown__",
    );
  }

  function validateScope(specs, scope) {
    var groupsByKey = {};
    var applicableObjects = {};
    var specStatusesByName = {};
    var passedChecks = 0;
    var failedChecks = 0;

    scope.objects.forEach(function (object) {
      specs.forEach(function (spec) {
        if (
          !matchesSpecApplicabilityLocally(object, spec) &&
          !matchesApplicabilityHint(object, spec)
        ) {
          return;
        }

        var objectKey = buildObjectIdentityKey(object);
        applicableObjects[objectKey] = true;

        var specName = spec.name || "Ukjent spesifikasjon";
        if (!specStatusesByName[specName]) {
          specStatusesByName[specName] = {
            specName: specName,
            applicableObjects: {},
            passedChecks: 0,
            failedChecks: 0,
          };
        }
        specStatusesByName[specName].applicableObjects[objectKey] = true;

        spec.requirements.forEach(function (rule) {
          var actual = getPropertyValue(
            object,
            rule.propertySet,
            rule.baseName,
          );
          var outcome = evaluateRule(actual, rule);
          if (outcome.ok) {
            if (!outcome.ignored) {
              passedChecks += 1;
              specStatusesByName[specName].passedChecks += 1;
            }
            return;
          }

          failedChecks += 1;
          specStatusesByName[specName].failedChecks += 1;
          var key = [
            scope.scopeKey,
            spec.name,
            rule.propertySet,
            rule.baseName,
            outcome.reasonCode,
          ].join("::");

          if (!groupsByKey[key]) {
            groupsByKey[key] = {
              key: key,
              scopeKey: scope.scopeKey,
              scopeLabel: scope.scopeLabel,
              modelName: scope.modelName,
              layerName: scope.layerName,
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
            modelName: object.modelName,
            layerName: object.layerName,
            scopeLabel: object.scopeLabel,
            actualValue: actual,
            expectedValue: describeRule(rule.valueRule),
          });
        });
      });
    });

    return {
      scopeKey: scope.scopeKey,
      scopeLabel: scope.scopeLabel,
      modelName: scope.modelName,
      layerName: scope.layerName,
      objectCount: scope.objects.length,
      groups: Object.keys(groupsByKey)
        .map(function (key) {
          return groupsByKey[key];
        })
        .sort(function (a, b) {
          return b.objects.length - a.objects.length;
        }),
      specStatuses: Object.keys(specStatusesByName).map(function (name) {
        var specStatus = specStatusesByName[name];
        return {
          specName: name,
          applicableObjects: specStatus.applicableObjects,
          applicableObjectCount: Object.keys(specStatus.applicableObjects)
            .length,
          passedChecks: specStatus.passedChecks,
          failedChecks: specStatus.failedChecks,
        };
      }),
      summary: {
        applicableObjectCount: Object.keys(applicableObjects).length,
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

  function matchesSpecApplicabilityLocally(object, spec) {
    if (matchesAllRules(object, spec.applicability)) {
      return true;
    }

    return matchesWildcardApplicabilityViaRequirements(object, spec);
  }

  function matchesWildcardApplicabilityViaRequirements(object, spec) {
    if (!object || !spec || !coerceArray(spec.applicability).length) {
      return false;
    }

    return coerceArray(spec.applicability).every(function (rule) {
      var actual = getPropertyValue(object, rule.propertySet, rule.baseName);
      if (evaluateRule(actual, rule).ok) {
        return true;
      }

      if (rule.baseName || !rule.propertySet) {
        return false;
      }

      var fallbackActual = findWildcardApplicabilityValue(
        object,
        spec,
        rule.propertySet,
      );
      return evaluateRule(fallbackActual, rule).ok;
    });
  }

  function findWildcardApplicabilityValue(object, spec, propertySet) {
    var candidateRules = coerceArray(spec.requirements).concat(
      coerceArray(spec.applicability).filter(function (rule) {
        return !!rule.baseName;
      }),
    );

    for (var i = 0; i < candidateRules.length; i += 1) {
      var candidateRule = candidateRules[i];
      if (!candidateRule.baseName) {
        continue;
      }
      if (
        propertySet &&
        candidateRule.propertySet &&
        !keysLooselyMatch(candidateRule.propertySet, propertySet)
      ) {
        continue;
      }

      var actual = getPropertyValue(
        object,
        candidateRule.propertySet || propertySet,
        candidateRule.baseName,
      );
      if (
        actual !== null &&
        typeof actual !== "undefined" &&
        String(actual).trim() !== ""
      ) {
        return actual;
      }
    }

    return null;
  }

  function matchesApplicabilityHint(object, spec) {
    if (!object || !spec) {
      return false;
    }

    return coerceArray(
      object.idsApplicableSpecs || object._idsApplicableSpecs,
    ).some(function (name) {
      return (
        normalizeComparisonText(name) === normalizeComparisonText(spec.name)
      );
    });
  }

  function evaluateRule(actualValue, rule) {
    var hasValue =
      actualValue !== null &&
      actualValue !== undefined &&
      String(actualValue).trim() !== "";
    var matches = matchValueRule(actualValue, rule.valueRule);

    // Only value mismatches should be reported as deviations. Missing
    // properties are ignored for validation reporting.
    if (!hasValue) {
      return { ok: true, ignored: true, reasonCode: "missing-ignored" };
    }

    if (rule.cardinality === "required") {
      if (!matches) {
        return { ok: false, reasonCode: "invalid-value" };
      }
      return { ok: true };
    }

    if (rule.cardinality === "optional") {
      if (!matches) {
        return { ok: false, reasonCode: "invalid-optional-value" };
      }
      return { ok: true };
    }

    if (rule.cardinality === "prohibited") {
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
      return (
        normalizeComparisonText(actual) ===
        normalizeComparisonText(valueRule.value)
      );
    }

    if (valueRule.type === "oneOf") {
      return (valueRule.values || []).some(function (value) {
        return (
          normalizeComparisonText(actual) === normalizeComparisonText(value)
        );
      });
    }

    if (valueRule.type === "pattern") {
      try {
        return new RegExp(anchorPattern(valueRule.value)).test(actual);
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

    var exactSet = object.propertySets[propertySet];
    if (
      exactSet &&
      propertyName &&
      Object.prototype.hasOwnProperty.call(exactSet, propertyName)
    ) {
      return exactSet[propertyName];
    }

    var normalizedSetName = findNormalizedKey(object.propertySets, propertySet);
    if (
      normalizedSetName &&
      propertyName &&
      Object.prototype.hasOwnProperty.call(
        object.propertySets[normalizedSetName],
        propertyName,
      )
    ) {
      return object.propertySets[normalizedSetName][propertyName];
    }

    if (!propertyName) {
      var anyValue = findAnyPropertyValue(exactSet || {});
      if (anyValue !== null) {
        return anyValue;
      }
      if (normalizedSetName) {
        var anyNormalizedValue = findAnyPropertyValue(
          object.propertySets[normalizedSetName],
        );
        if (anyNormalizedValue !== null) {
          return anyNormalizedValue;
        }
      }

      var wildcardFlatValue = findAnyFlatPropertyValueForSet(
        object.propertySets.__flat__,
        propertySet,
      );
      if (wildcardFlatValue !== null) {
        return wildcardFlatValue;
      }
    }

    var directMatch = findValueByNormalizedKey(exactSet || {}, propertyName);
    if (directMatch !== null) {
      return directMatch;
    }

    if (normalizedSetName) {
      var normalizedMatch = findValueByNormalizedKey(
        object.propertySets[normalizedSetName],
        propertyName,
      );
      if (normalizedMatch !== null) {
        return normalizedMatch;
      }
    }

    var flatKeys = buildPropertyLookupKeys(propertySet, propertyName);
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

    var normalizedFlatValue = findAnyFlatPropertyValue(
      object.propertySets.__flat__,
      flatKeys,
    );
    if (normalizedFlatValue !== null) {
      return normalizedFlatValue;
    }

    var setNames = Object.keys(object.propertySets);
    for (var j = 0; j < setNames.length; j += 1) {
      if (
        propertySet &&
        !keysLooselyMatch(setNames[j], propertySet) &&
        setNames[j] !== "__flat__"
      ) {
        continue;
      }

      if (
        propertyName &&
        Object.prototype.hasOwnProperty.call(
          object.propertySets[setNames[j]],
          propertyName,
        )
      ) {
        return object.propertySets[setNames[j]][propertyName];
      }

      var scopedValue = findValueByNormalizedKey(
        object.propertySets[setNames[j]],
        propertyName,
      );
      if (scopedValue !== null) {
        return scopedValue;
      }

      if (!propertyName && keysLooselyMatch(setNames[j], propertySet)) {
        var wildcardScopedValue = findAnyPropertyValue(
          object.propertySets[setNames[j]],
        );
        if (wildcardScopedValue !== null) {
          return wildcardScopedValue;
        }
      }
    }

    return null;
  }

  function buildPropertyLookupKeys(propertySet, propertyName) {
    var keys = buildSearchKeys(propertySet, propertyName);
    if (!propertySet) {
      return keys;
    }

    return keys.filter(function (key) {
      return !!splitCompositePropertyKey(key);
    });
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
      return "Objektene mangler en verdi som IDS krever.";
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
    if (valueRule.type === "oneOf") {
      return "En av: " + (valueRule.values || []).join(", ");
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
      return;
    }

    els.metricObjects.textContent = String(
      report.summary.objectCountUnique || report.summary.objectCount || 0,
    );
    els.metricSpecs.textContent = String(report.summary.specCount);
    els.metricGroups.textContent = String(report.groups.length);
  }

  function renderResultTable(report) {
    if (!els.resultTableRoot) {
      return;
    }

    if (!report || !coerceArray(report.specStatuses).length) {
      els.resultTableRoot.className = "result-table-wrap empty-state";
      els.resultTableRoot.textContent =
        "Kjør en IDS-kontroll for å se status per spesifikasjon.";
      return;
    }

    if (hasUnevaluatedSpecStatuses(report)) {
      els.resultTableRoot.className = "result-table-wrap empty-state";
      els.resultTableRoot.textContent =
        "Status per spesifikasjon skjules så lenge det finnes saker som ikke er vurdert.";
      return;
    }

    els.resultTableRoot.className = "result-table-wrap";
    els.resultTableRoot.innerHTML = [
      '<div class="result-table-head">Status per spesifikasjon</div>',
      '<table class="result-table">',
      "  <thead>",
      "    <tr>",
      "      <th>Spesifikasjon</th>",
      "      <th>Objekter evaluert</th>",
      "      <th>Avvik</th>",
      "      <th>Status</th>",
      "    </tr>",
      "  </thead>",
      "  <tbody>" +
        report.specStatuses
          .map(function (specStatus) {
            var status = determineSpecStatus(specStatus);
            return [
              "<tr>",
              "  <td>" + escapeHtml(specStatus.specName || "-") + "</td>",
              "  <td>" +
                String(specStatus.applicableObjectCount || 0) +
                "</td>",
              "  <td>" + String(specStatus.failedChecks || 0) + "</td>",
              '  <td><span class="status-pill ' +
                status.className +
                '">' +
                escapeHtml(status.label) +
                "</span></td>",
              "</tr>",
            ].join("");
          })
          .join("") +
        "</tbody>",
      "</table>",
    ].join("");
  }

  function hasUnevaluatedSpecStatuses(report) {
    return coerceArray(report && report.specStatuses).some(function (specStatus) {
      var status = determineSpecStatus(specStatus);
      return status && status.label === "Ikke vurdert";
    });
  }

  function renderPropertyDebug(specs, objects) {
    if (!els.propertyDebugRoot) {
      return;
    }

    if (!specs || !objects) {
      els.propertyDebugRoot.className = "result-table-wrap empty-state";
      els.propertyDebugRoot.textContent =
        "Midlertidig debug for Trekkekum_853.AntallRor_10840 vises etter kjøring.";
      return;
    }

    var debugRows = buildPropertyDebugRows(specs, objects);
    if (!debugRows.length) {
      els.propertyDebugRoot.className = "result-table-wrap empty-state";
      els.propertyDebugRoot.textContent =
        "Fant ingen relevante objekter eller regler for Trekkekum_853.AntallRor_10840.";
      return;
    }

    els.propertyDebugRoot.className = "result-table-wrap";
    els.propertyDebugRoot.innerHTML = [
      '<div class="result-table-head">Debug: Trekkekum_853.AntallRor_10840</div>',
      '<table class="result-table result-table-debug">',
      "  <thead>",
      "    <tr>",
      "      <th>Objekt</th>",
      "      <th>Spesifikasjon</th>",
      "      <th>Vurderes</th>",
      "      <th>Verdi lest</th>",
      "      <th>Resultat</th>",
      "      <th>Handling</th>",
      "    </tr>",
      "  </thead>",
      "  <tbody>" +
        debugRows
          .map(function (row) {
            return [
              "<tr>",
              "  <td>" +
                escapeHtml(row.objectLabel) +
                '<div class="debug-subline">' +
                escapeHtml(row.objectId) +
                "</div></td>",
              "  <td>" + escapeHtml(row.specName) + "</td>",
              '  <td><span class="status-pill ' +
                row.applicability.className +
                '">' +
                escapeHtml(row.applicability.label) +
                "</span></td>",
              "  <td>" + escapeHtml(row.actualValue) + "</td>",
              '  <td><span class="status-pill ' +
                row.outcome.className +
                '">' +
                escapeHtml(row.outcome.label) +
                "</span></td>",
              '  <td>' +
                (row.objectIdForAction
                  ? '<button class="btn btn-secondary btn-inline" type="button" data-action="goto-object" data-object-id="' +
                    escapeHtml(row.objectIdForAction) +
                    '" data-object-label="' +
                    escapeHtml(row.objectLabel || row.objectIdForAction) +
                    '">Gå til objekt</button>'
                  : '<span class="status-note">-</span>') +
                "</td>",
              "</tr>",
            ].join("");
          })
          .join("") +
        "</tbody>",
      "</table>",
    ].join("");
  }

  function buildPropertyDebugRows(specs, objects) {
    var relevantSpecs = coerceArray(specs).filter(function (spec) {
      return coerceArray(spec.requirements).some(function (rule) {
        return isDebugPropertyRule(rule);
      });
    });

    var rows = [];
    coerceArray(objects).forEach(function (object) {
      relevantSpecs.forEach(function (spec) {
        var rule = findDebugPropertyRule(spec);
        if (!rule) {
          return;
        }

        var isApplicable =
          matchesSpecApplicabilityLocally(object, spec) ||
          matchesApplicabilityHint(object, spec);
        var actual = getPropertyValue(object, rule.propertySet, rule.baseName);
        var hasValue = hasReadableValue(actual);

        if (!isApplicable && !hasValue) {
          return;
        }

        if (!hasValue) {
          return;
        }

        var evaluation = isApplicable
          ? evaluateRule(actual, rule)
          : { ok: true, ignored: true, reasonCode: "outside-spec" };

        rows.push({
          objectLabel: object.name || object.type || "Ukjent objekt",
          objectId: object.guid || object.id || "-",
          objectIdForAction: resolveObjectIdentifier(object),
          specName: spec.name || "Ukjent spesifikasjon",
          actualValue: hasValue ? stringifyValue(actual) : "[mangler]",
          applicability: isApplicable
            ? { label: "Ja", className: "status-success" }
            : { label: "Nei", className: "status-neutral" },
          outcome: describeDebugOutcome(evaluation, isApplicable),
        });
      });
    });

    return rows.sort(function (a, b) {
      return (
        debugOutcomeRank(a.outcome.label) - debugOutcomeRank(b.outcome.label)
      );
    });
  }

  function findDebugPropertyRule(spec) {
    var requirements = coerceArray(spec && spec.requirements);
    for (var i = 0; i < requirements.length; i += 1) {
      if (isDebugPropertyRule(requirements[i])) {
        return requirements[i];
      }
    }
    return null;
  }

  function isDebugPropertyRule(rule) {
    return (
      rule &&
      keysLooselyMatch(rule.propertySet, DEBUG_PROPERTY_SET) &&
      keysLooselyMatch(rule.baseName, DEBUG_PROPERTY_NAME)
    );
  }

  function hasReadableValue(value) {
    return (
      value !== null &&
      typeof value !== "undefined" &&
      String(value).trim() !== ""
    );
  }

  function describeDebugOutcome(evaluation, isApplicable) {
    if (!isApplicable) {
      return { label: "Ikke i spesifikasjon", className: "status-neutral" };
    }
    if (!evaluation.ok) {
      return { label: "Verdiavvik", className: "status-fail" };
    }
    if (evaluation.ignored) {
      return { label: "Property mangler", className: "status-partial" };
    }
    return { label: "OK", className: "status-success" };
  }

  function debugOutcomeRank(label) {
    if (label === "Verdiavvik") {
      return 0;
    }
    if (label === "Property mangler") {
      return 1;
    }
    if (label === "Ikke i spesifikasjon") {
      return 2;
    }
    return 3;
  }

  function determineSpecStatus(specStatus) {
    var applicable =
      Number(specStatus && specStatus.applicableObjectCount) || 0;
    var passed = Number(specStatus && specStatus.passedChecks) || 0;
    var failed = Number(specStatus && specStatus.failedChecks) || 0;
    var evaluated = passed + failed;

    if (applicable > 0 && evaluated === 0) {
      return { label: "Ikke vurdert", className: "status-partial" };
    }

    if (failed === 0 && passed > 0) {
      return { label: "Suksess", className: "status-success" };
    }
    if (failed > 0 && passed > 0) {
      return { label: "Delvis avvik", className: "status-partial" };
    }
    if (failed > 0) {
      return { label: "Avvik", className: "status-fail" };
    }
    return { label: "Ingen treff", className: "status-partial" };
  }

  function renderGroups(report) {
    if (!report || !report.scopes || !report.scopes.length) {
      els.groupsRoot.className = "group-list empty-state";
      els.groupsRoot.textContent = "Ingen grupperte avvik å vise.";
      return;
    }

    els.groupsRoot.className = "group-list";
    els.groupsRoot.innerHTML = report.scopes
      .map(function (scope) {
        return [
          '<section class="scope-section">',
          '  <div class="scope-head">',
          "    <div>",
          '      <p class="scope-title">' +
            escapeHtml(scope.scopeLabel) +
            "</p>",
          '      <p class="scope-meta">' +
            escapeHtml(
              scope.objectCount +
                " objekter, " +
                scope.summary.applicableObjectCount +
                " vurdert mot IDS, " +
                scope.groups.length +
                " feilgrupper",
            ) +
            "</p>",
          "    </div>",
          '    <div class="badge">' +
            scope.summary.failedChecks +
            " avvik</div>",
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
                        escapeHtml(
                          group.propertySet + "." + group.propertyName,
                        ) +
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
                            var objectId = resolveObjectIdentifier(object);
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
                              escapeHtml(object.actualValue || "[mangler]") +
                              (objectId
                                ? '<div class="object-actions"><button class="btn btn-secondary btn-inline" type="button" data-action="goto-object" data-object-id="' +
                                  escapeHtml(objectId) +
                                  '" data-object-label="' +
                                  escapeHtml(object.name || object.type || objectId) +
                                  '">Gå til objekt</button></div>'
                                : "")
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
          createBcfForGroup(groupIndex, button);
        });
      });

    updateBcfUi();
  }

  async function createBcfForGroup(groupIndex, triggerButton) {
    if (!state.validation || !state.validation.groups[groupIndex]) {
      setRunStatus(
        "Fant ikke avviksgruppen for valgt BCF-knapp.",
        "state-error",
      );
      return;
    }

    if (!supportsBcfCreation(state.streamBim.api)) {
      setRunStatus(getBcfUnavailableMessage(), "state-warn");
      return;
    }

    var group = state.validation.groups[groupIndex];
    setRunStatus('Oppretter BCF for gruppen "' + group.title + '"...', "");
    setTransientButtonState(triggerButton, "Oppretter...", true, "btn-working");

    try {
      await createBcfIssue(group);
      setRunStatus(
        'BCF med capture opprettet for gruppen "' +
          group.title +
          '" i ' +
          group.scopeLabel +
          ".",
        "state-ok",
      );
      setTransientButtonState(
        triggerButton,
        "BCF opprettet",
        true,
        "btn-success",
      );
    } catch (error) {
      setRunStatus(
        "Kunne ikke opprette BCF: " + getErrorMessage(error),
        "state-error",
      );
      setTransientButtonState(triggerButton, "Opprett BCF", false, "");
    }
  }

  async function createBcfForAllGroups() {
    if (!state.validation || !state.validation.groups.length) {
      setRunStatus("Ingen feilgrupper å opprette BCF fra.", "state-warn");
      return;
    }

    if (!supportsBcfCreation(state.streamBim.api)) {
      setRunStatus(getBcfUnavailableMessage(), "state-warn");
      return;
    }

    var created = 0;
    setRunStatus(
      "Oppretter BCF for " + state.validation.groups.length + " grupper...",
      "",
    );
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

    setRunStatus(
      "BCF med capture opprettet for " + created + " grupper.",
      "state-ok",
    );
  }

  async function createBcfIssue(group) {
    var api = state.streamBim.api;
    var methodName = getBcfMethodName(api);
    var payload = buildBcfPayload(group);

    if (methodName) {
      try {
        return await invokeMethodGuessing(api, methodName, [
          payload,
          { issue: payload },
          { topic: payload },
        ]);
      } catch (error) {
        if (!supportsRawTopicCreation(api)) {
          throw error;
        }
      }
    }

    if (supportsRawTopicCreation(api)) {
      return createTopicViaRawApi(group, payload);
    }

    throw new Error(getBcfUnavailableMessage());
  }

  function buildBcfPayload(group) {
    return {
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
        group.objects.length +
        "\nGUID-er: " +
        group.objects
          .map(function (object) {
            return object.guid || object.id || object.name;
          })
          .filter(Boolean)
          .join(", "),
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
  }
  async function createTopicViaRawApi(group, payload) {
    var api = state.streamBim.api;
    var context = await createRawIfcApiContext(api);

    if (!context.apiBase || !context.buildingId) {
      throw new Error(
        "Klarte ikke etablere prosjektkontekst for topics-endepunktet.",
      );
    }

    var requestBody = {
      data: {
        attributes: {
          "is-deleted": false,
          channel: "workflows",
          cost: "",
          "send-notification": false,
          "selected-count": null,
          description: payload.description,
          title: payload.title,
          "due-date": null,
          starred: false,
          "is-draft": false,
        },
        relationships: {
          "checklist-item-instance": {
            data: null,
          },
          "document-revision": {
            data: null,
          },
          building: {
            data: {
              type: "buildings",
              id: String(context.buildingId),
            },
          },
          "assigned-to-user": {
            data: null,
          },
          "assigned-to-group": {
            data: null,
          },
          status: {
            data: {
              type: "statuses",
              id: "2000",
            },
          },
          workflow: {
            data: {
              type: "workflows",
              id: "1001",
            },
          },
        },
        type: "topics",
      },
    };

    var topicResponse = await makeApiJsonRequest(api, {
      url: context.apiBase + "/v2/topics",
      method: "POST",
      accept: "application/vnd.api+json",
      contentType: "application/vnd.api+json",
      body: requestBody,
    });

    var topicId = extractTopicId(topicResponse);
    if (!topicId) {
      throw new Error("Topics-endepunktet returnerte ingen topic-id.");
    }

    var viewpointResponse = await createTopicViewpointViaRawApi(
      api,
      context,
      topicId,
    );
    var viewpointId = extractViewpointId(viewpointResponse);
    if (!viewpointId) {
      throw new Error(
        "Topic " + topicId + " ble opprettet, men viewpoint mangler.",
      );
    }

    try {
      await createTopicCaptureAttachmentViaRawApi(
        api,
        context,
        viewpointId,
        group,
      );
    } catch (error) {
      throw new Error(
        "Topic " +
          topicId +
          " ble opprettet, men capture feilet: " +
          getErrorMessage(error),
      );
    }

    return {
      topic: topicResponse,
      viewpoint: viewpointResponse,
      topicId: topicId,
      viewpointId: viewpointId,
    };
  }

  async function createTopicViewpointViaRawApi(api, context, topicId) {
    var cameraState = await bestEffortGetCameraState(api);
    if (!cameraState) {
      return null;
    }

    return makeApiJsonRequest(api, {
      url: context.apiBase + "/v2/topic-viewpoints",
      method: "POST",
      accept: "application/vnd.api+json",
      contentType: "application/vnd.api+json",
      body: {
        data: {
          attributes: {
            "camera-state": cameraState,
            "hidden-layers": [],
            "selected-count": null,
          },
          relationships: {
            object: {
              data: null,
            },
            building: {
              data: {
                type: "buildings",
                id: String(context.buildingId),
              },
            },
            topic: {
              data: {
                type: "topics",
                id: String(topicId),
              },
            },
          },
          type: "topic-viewpoints",
        },
      },
    });
  }

  async function createTopicCaptureAttachmentViaRawApi(
    api,
    context,
    viewpointId,
    group,
  ) {
    if (!api || typeof api.takeScreenshot !== "function") {
      throw new Error("Widget-API eksponerer ikke takeScreenshot().");
    }

    var screenshot = await api.takeScreenshot();
    if (
      typeof screenshot !== "string" ||
      screenshot.indexOf("data:image/") !== 0
    ) {
      throw new Error("takeScreenshot() returnerte ingen gyldig capture.");
    }

    var captureFile = dataUrlToUploadFile(
      screenshot,
      buildCaptureFilename(group),
    );
    var uploadTicketResponse = await createUploadTicketViaRawApi(
      api,
      context,
      captureFile,
    );
    var uploadTicketId = extractUploadTicketId(uploadTicketResponse);
    if (!uploadTicketId) {
      throw new Error("Upload-ticket ble ikke opprettet.");
    }

    await uploadCaptureBinary(
      context,
      uploadTicketId,
      captureFile,
      uploadTicketResponse,
    );

    var attachmentResponse = await createCaptureAttachmentViaRawApi(
      api,
      context,
      viewpointId,
      uploadTicketId,
    );
    var attachmentId = extractAttachmentId(attachmentResponse);
    if (!attachmentId) {
      throw new Error("Attachment-endepunktet returnerte ingen attachment-id.");
    }

    return attachmentResponse;
  }

  async function createUploadTicketViaRawApi(api, context, file) {
    return makeApiJsonRequest(api, {
      url: context.apiBase + "/v2/upload-tickets",
      method: "POST",
      accept: "application/vnd.api+json",
      contentType: "application/vnd.api+json",
      body: {
        data: {
          attributes: {
            filename: file.name,
            "file-size": file.size,
            "last-modified": new Date(
              file.lastModified || Date.now(),
            ).toISOString(),
          },
          type: "upload-tickets",
        },
      },
    });
  }

  async function uploadCaptureBinary(
    context,
    uploadTicketId,
    file,
    uploadTicketResponse,
  ) {
    var uploadUrl =
      extractUploadBinaryUrl(uploadTicketResponse) ||
      buildAbsoluteApiUrl(context.apiBase + "/documents/_upload");
    if (!uploadUrl) {
      throw new Error("Klarte ikke bygge absolutt upload-url.");
    }

    var formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("id", uploadTicketId);

    await postMultipartFormData(uploadUrl, formData, getStreamBimAuthToken());
  }

  async function createCaptureAttachmentViaRawApi(
    api,
    context,
    viewpointId,
    uploadTicketId,
  ) {
    return makeApiJsonRequest(api, {
      url: context.apiBase + "/v2/attachments",
      method: "POST",
      accept: "application/vnd.api+json",
      contentType: "application/vnd.api+json",
      body: {
        data: {
          attributes: {
            category: "screenshot",
            "creation-method": "UPLOAD",
            metadata: {
              preview: true,
            },
          },
          relationships: {
            parent: {
              data: {
                type: "topic-viewpoints",
                id: String(viewpointId),
              },
            },
            "upload-ticket": {
              data: {
                type: "upload-tickets",
                id: String(uploadTicketId),
              },
            },
          },
          type: "attachments",
        },
      },
    });
  }

  async function bestEffortGetCameraState(api) {
    if (!api || typeof api.getCameraState !== "function") {
      return null;
    }

    try {
      var rawState = await api.getCameraState();
      if (!rawState || typeof rawState !== "object") {
        return null;
      }

      var cameraState = {};
      [
        "position",
        "quaternion",
        "showGrid",
        "target",
        "up",
        "fov",
        "distance",
        "rotation",
      ].forEach(function (key) {
        if (typeof rawState[key] !== "undefined") {
          cameraState[key] = rawState[key];
        }
      });

      return Object.keys(cameraState).length ? cameraState : rawState;
    } catch (error) {
      return null;
    }
  }

  function extractTopicId(response) {
    return firstNonEmpty([
      response && response.data && response.data.id,
      response && response.id,
      response &&
        response.data &&
        response.data.topic &&
        response.data.topic.id,
    ]);
  }

  function extractViewpointId(response) {
    return firstNonEmpty([
      response && response.data && response.data.id,
      response && response.id,
      response &&
        response.data &&
        response.data.viewpoint &&
        response.data.viewpoint.id,
    ]);
  }

  function extractUploadTicketId(response) {
    return firstNonEmpty([
      response && response.data && response.data.id,
      response && response.id,
      response &&
        response.data &&
        response.data["upload-ticket"] &&
        response.data["upload-ticket"].id,
    ]);
  }

  function extractAttachmentId(response) {
    return firstNonEmpty([
      response && response.data && response.data.id,
      response && response.id,
      response &&
        response.data &&
        response.data.attachment &&
        response.data.attachment.id,
    ]);
  }

  function extractUploadBinaryUrl(response) {
    var candidates = [
      response &&
        response.data &&
        response.data.attributes &&
        response.data.attributes["upload-url"],
      response &&
        response.data &&
        response.data.attributes &&
        response.data.attributes.uploadUrl,
      response &&
        response.data &&
        response.data.attributes &&
        response.data.attributes.url,
      response &&
        response.data &&
        response.data.links &&
        response.data.links.upload,
      response && response.uploadUrl,
      response && response.url,
    ].filter(Boolean);

    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = String(candidates[i] || "").trim();
      if (!candidate) {
        continue;
      }
      if (/^https?:\/\//i.test(candidate) || candidate.charAt(0) === "/") {
        return buildAbsoluteApiUrl(candidate);
      }
    }

    return "";
  }

  function buildCaptureFilename(group) {
    var scope =
      String((group && group.scopeLabel) || "ids")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "ids";
    return "ids-svv-" + scope + "-" + Date.now() + ".jpg";
  }

  function dataUrlToUploadFile(dataUrl, filename) {
    var parts = String(dataUrl || "").split(",");
    if (parts.length < 2) {
      throw new Error("Ugyldig data-url for screenshot.");
    }

    var mimeMatch = parts[0].match(/^data:([^;]+);base64$/i);
    var mimeType = mimeMatch && mimeMatch[1] ? mimeMatch[1] : "image/jpeg";
    var binary = atob(parts[1]);
    var bytes = new Uint8Array(binary.length);

    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    try {
      return new File([bytes], filename, {
        type: mimeType,
        lastModified: Date.now(),
      });
    } catch (error) {
      var blob = new Blob([bytes], { type: mimeType });
      blob.name = filename;
      blob.lastModified = Date.now();
      return blob;
    }
  }

  function buildAbsoluteApiUrl(url) {
    if (!url) {
      return "";
    }
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    var origins = [];

    function addOrigin(candidate) {
      if (!candidate || origins.indexOf(candidate) >= 0) {
        return;
      }
      origins.push(candidate);
    }

    try {
      if (document.referrer) {
        addOrigin(new URL(document.referrer).origin);
      }
    } catch (error) {}

    try {
      if (window.parent && window.parent.location) {
        addOrigin(window.parent.location.origin);
      }
    } catch (error) {}

    try {
      if (window.top && window.top.location) {
        addOrigin(window.top.location.origin);
      }
    } catch (error) {}

    try {
      addOrigin(window.location.origin);
    } catch (error) {}

    return origins.length ? origins[0] + url : url;
  }

  function getStreamBimAuthToken() {
    var windowsToCheck = [];

    function addWindow(candidate) {
      if (!candidate || windowsToCheck.indexOf(candidate) >= 0) {
        return;
      }
      windowsToCheck.push(candidate);
    }

    addWindow(window);

    try {
      addWindow(window.parent);
    } catch (error) {}

    try {
      addWindow(window.top);
    } catch (error) {}

    for (var i = 0; i < windowsToCheck.length; i += 1) {
      var token = extractAuthTokenFromWindow(windowsToCheck[i]);
      if (token) {
        return token;
      }
    }

    return "";
  }

  function extractAuthTokenFromWindow(targetWindow) {
    if (!targetWindow) {
      return "";
    }

    var storages = [];
    try {
      if (targetWindow.localStorage) {
        storages.push(targetWindow.localStorage);
      }
    } catch (error) {}

    try {
      if (targetWindow.sessionStorage) {
        storages.push(targetWindow.sessionStorage);
      }
    } catch (error) {}

    var keys = ["ember_simple_auth-session", "ember-simple-auth-session"];

    for (var i = 0; i < storages.length; i += 1) {
      for (var j = 0; j < keys.length; j += 1) {
        try {
          var raw = storages[i].getItem(keys[j]);
          if (!raw) {
            continue;
          }
          var parsed = JSON.parse(raw);
          var token = firstNonEmpty([
            parsed && parsed.authenticated && parsed.authenticated.idToken,
            parsed && parsed.authenticated && parsed.authenticated.accessToken,
            parsed &&
              parsed.data &&
              parsed.data.authenticated &&
              parsed.data.authenticated.idToken,
            parsed &&
              parsed.data &&
              parsed.data.authenticated &&
              parsed.data.authenticated.accessToken,
            parsed && parsed.idToken,
            parsed && parsed.accessToken,
          ]);
          if (token) {
            return String(token);
          }
        } catch (error) {}
      }
    }

    return "";
  }

  function postMultipartFormData(url, formData, bearerToken) {
    return new Promise(function (resolve, reject) {
      var request = new XMLHttpRequest();
      request.open("POST", url, true);
      request.withCredentials = true;
      if (bearerToken) {
        request.setRequestHeader("Authorization", "Bearer " + bearerToken);
      }
      request.onload = function () {
        if (request.status >= 200 && request.status < 300) {
          resolve(request.responseText);
          return;
        }
        reject(
          new Error(
            "Screenshot-upload feilet med HTTP " + request.status + ".",
          ),
        );
      };
      request.onerror = function () {
        reject(new Error("Nettverksfeil under screenshot-upload."));
      };
      request.send(formData);
    });
  }

  function getBcfMethodName(api) {
    return firstAvailableMethod(api, [
      "createBcfIssue",
      "createIssue",
      "addIssue",
      "createBcf",
      "createTopic",
    ]);
  }

  function supportsRawTopicCreation(api) {
    return !!(
      api &&
      typeof api.makeApiRequest === "function" &&
      typeof api.getProjectId === "function" &&
      typeof api.getBuildingId === "function"
    );
  }

  function supportsBcfCreation(api) {
    return !!(getBcfMethodName(api) || supportsRawTopicCreation(api));
  }

  function getBcfUnavailableMessage() {
    return "Denne StreamBIM-instansen eksponerer ingen direkte BCF-metode, og widgeten mangler prosjekt-API for fallback til topics-endepunktet.";
  }

  function updateBcfUi() {
    var supported = supportsBcfCreation(state.streamBim.api);
    var title = supported
      ? "Opprett BCF for alle grupper"
      : getBcfUnavailableMessage();

    if (els.createAllBcfBtn) {
      els.createAllBcfBtn.disabled = !supported;
      els.createAllBcfBtn.title = title;
    }

    if (!els.groupsRoot) {
      return;
    }

    Array.prototype.slice
      .call(els.groupsRoot.querySelectorAll('[data-action="create-bcf"]'))
      .forEach(function (button) {
        button.disabled = !supported;
        button.title = title;
      });
  }

  function setTransientButtonState(button, label, disabled, extraClassName) {
    if (!button) {
      return;
    }

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent;
    }

    button.textContent = label || button.dataset.defaultLabel;
    button.disabled = !!disabled;
    button.classList.remove("btn-working", "btn-success");
    if (extraClassName) {
      button.classList.add(extraClassName);
    }

    if (extraClassName === "btn-success") {
      window.setTimeout(function () {
        button.textContent = button.dataset.defaultLabel || "Utført";
        button.disabled = false;
        button.classList.remove("btn-working", "btn-success");
      }, 1800);
    }
  }

  function onObjectActionClick(event) {
    var target = event && event.target;
    var button =
      target && typeof target.closest === "function"
        ? target.closest('[data-action="goto-object"]')
        : null;
    if (!button) {
      return;
    }
    event.preventDefault();
    goToObjectFromButton(button);
  }

  async function goToObjectFromButton(button) {
    var objectId = button.getAttribute("data-object-id");
    var objectLabel =
      button.getAttribute("data-object-label") || objectId || "objekt";
    var api = state.streamBim && state.streamBim.api;

    if (!objectId) {
      setRunStatus("Objekt-ID mangler for valgt rad.", "state-warn");
      return;
    }
    if (!api) {
      setRunStatus("Widgeten er ikke koblet til StreamBIM.", "state-warn");
      return;
    }
    if (
      typeof api.gotoObject !== "function" &&
      typeof api.highlightObject !== "function"
    ) {
      setRunStatus(
        "StreamBIM-API eksponerer ikke gotoObject/highlightObject.",
        "state-error",
      );
      return;
    }

    setTransientButtonState(button, "Åpner...", true, "btn-working");
    try {
      if (typeof api.highlightObject === "function") {
        await Promise.resolve(api.highlightObject(objectId));
      }
      if (typeof api.gotoObject === "function") {
        await Promise.resolve(api.gotoObject(objectId));
      }
      setRunStatus('Åpnet objekt "' + objectLabel + '" i modellen.', "state-ok");
      setTransientButtonState(button, "Åpnet", true, "btn-success");
    } catch (error) {
      setRunStatus(
        "Kunne ikke åpne objekt: " + getErrorMessage(error),
        "state-error",
      );
      setTransientButtonState(button, "Gå til objekt", false, "");
    }
  }

  function resolveObjectIdentifier(object) {
    return String(
      firstNonEmpty([
        object && object.guid,
        object && object.objectGuid,
        object && object.globalId,
        object && object.ifcGuid,
        object && object.id,
        object && object.objectId,
      ]) || "",
    ).trim();
  }

  function setRunStatus(message, className) {
    els.runStatus.textContent = message;
    els.runStatus.className = "run-status " + (className || "");
  }

  function toggleBusy(isBusy) {
    els.validateBtn.disabled = isBusy;
    if (els.createAllBcfBtn) {
      els.createAllBcfBtn.disabled = isBusy;
    }
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

  function uniqueStrings(values) {
    var seen = {};
    return coerceArray(values).filter(function (value) {
      var key = String(value || "");
      if (!key || seen[key]) {
        return false;
      }
      seen[key] = true;
      return true;
    });
  }

  function pickFirst(source, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      if (source && source[keys[i]]) {
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

  function firstNonEmpty(values) {
    for (var i = 0; i < values.length; i += 1) {
      if (
        values[i] !== null &&
        typeof values[i] !== "undefined" &&
        String(values[i]).trim() !== ""
      ) {
        return values[i];
      }
    }
    return "";
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

  function inferObjectScope(item, propertySets) {
    var modelName =
      firstNonEmpty([
        pickFirst(item, [
          "modelName",
          "model",
          "sourceModel",
          "documentName",
          "document",
          "fileName",
          "file",
          "sourceFile",
          "ModelName",
          "Model",
          "FileName",
        ]),
        findPropertyAcrossSets(propertySets, [
          "Model",
          "ModelName",
          "Model Name",
          "File",
          "FileName",
          "File Name",
          "Source File",
          "Document",
        ]),
      ]) || "";

    var layerName =
      firstNonEmpty([
        pickFirst(item, [
          "layerName",
          "layer",
          "modelLayer",
          "sourceLayer",
          "discipline",
          "containerName",
          "LayerName",
          "Layer",
        ]),
        findPropertyAcrossSets(propertySets, [
          "Layer",
          "LayerName",
          "Layer Name",
          "Model Layer",
          "Discipline",
          "Container",
        ]),
      ]) || "";

    var labelParts = [];
    if (modelName) {
      labelParts.push(modelName);
    }
    if (
      layerName &&
      normalizeComparisonText(layerName) !== normalizeComparisonText(modelName)
    ) {
      labelParts.push(layerName);
    }

    return {
      modelName: modelName,
      layerName: layerName,
      scopeKey: labelParts.length
        ? labelParts.map(normalizeComparisonText).join("::")
        : "__default__",
      scopeLabel: labelParts.length
        ? labelParts.join(" / ")
        : "Uspesifisert modellag",
    };
  }

  function findPropertyAcrossSets(propertySets, candidateNames) {
    if (!propertySets) {
      return "";
    }

    var setNames = Object.keys(propertySets);
    for (var i = 0; i < setNames.length; i += 1) {
      for (var j = 0; j < candidateNames.length; j += 1) {
        var match = findValueByNormalizedKey(
          propertySets[setNames[i]],
          candidateNames[j],
        );
        if (match !== null && String(match).trim() !== "") {
          return match;
        }
      }
    }

    return "";
  }

  function findNormalizedKey(map, expectedKey) {
    if (!map || !expectedKey) {
      return "";
    }

    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i += 1) {
      if (keysLooselyMatch(keys[i], expectedKey)) {
        return keys[i];
      }
    }
    return "";
  }

  function findValueByNormalizedKey(map, expectedKey) {
    if (!map || !expectedKey) {
      return null;
    }

    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i += 1) {
      if (keysLooselyMatch(keys[i], expectedKey)) {
        return map[keys[i]];
      }
    }
    return null;
  }

  function findAnyFlatPropertyValue(flatMap, candidateKeys) {
    if (!flatMap) {
      return null;
    }

    var keys = Object.keys(flatMap);
    for (var i = 0; i < keys.length; i += 1) {
      for (var j = 0; j < candidateKeys.length; j += 1) {
        if (keysLooselyMatch(keys[i], candidateKeys[j])) {
          return flatMap[keys[i]];
        }
      }
    }

    return null;
  }

  function findAnyFlatPropertyValueForSet(flatMap, propertySet) {
    if (!flatMap || !propertySet) {
      return null;
    }

    var keys = Object.keys(flatMap);
    for (var i = 0; i < keys.length; i += 1) {
      var split = splitCompositePropertyKey(keys[i]);
      if (split && keysLooselyMatch(split.propertySet, propertySet)) {
        return flatMap[keys[i]];
      }
    }

    return null;
  }

  function findAnyPropertyValue(map) {
    if (!map || typeof map !== "object") {
      return null;
    }

    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i += 1) {
      var value = map[keys[i]];
      if (
        value !== null &&
        typeof value !== "undefined" &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }

    return null;
  }

  function keysLooselyMatch(left, right) {
    if (!left || !right) {
      return false;
    }

    var leftAliases = buildComparisonAliases(left);
    var rightAliases = buildComparisonAliases(right);
    var seen = {};

    for (var i = 0; i < leftAliases.length; i += 1) {
      seen[leftAliases[i]] = true;
    }
    for (var j = 0; j < rightAliases.length; j += 1) {
      if (seen[rightAliases[j]]) {
        return true;
      }
    }

    return false;
  }

  function anchorPattern(pattern) {
    var source = String(pattern || "").trim();
    if (!source) {
      return ".*";
    }
    if (source.charAt(0) === "^" && source.charAt(source.length - 1) === "$") {
      return source;
    }
    return "^(?:" + source + ")$";
  }

  function buildComparisonAliases(value) {
    var normalized = normalizeComparisonText(value);
    if (!normalized) {
      return [];
    }

    var aliases = [];

    function pushAlias(alias) {
      if (!alias) {
        return;
      }
      aliases.push(alias);

      var nordicFolded = foldNordicCharacters(alias);
      if (nordicFolded && nordicFolded !== alias) {
        aliases.push(nordicFolded);
      }
    }

    pushAlias(normalized);

    var separatorCollapsed = normalized
      .replace(/[._:/>-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (separatorCollapsed) {
      pushAlias(separatorCollapsed);
    }

    var condensed = separatorCollapsed.replace(/[^a-z0-9]+/g, "");
    if (condensed) {
      pushAlias(condensed);
    }

    var strippedSuffix = normalized.replace(/[\s._:/>-]*\d+$/, "").trim();
    if (strippedSuffix) {
      pushAlias(strippedSuffix);
    }

    var strippedSuffixCollapsed = separatorCollapsed
      .replace(/[\s._:/>-]*\d+$/, "")
      .trim();
    if (strippedSuffixCollapsed) {
      pushAlias(strippedSuffixCollapsed);
      pushAlias(strippedSuffixCollapsed.replace(/[^a-z0-9]+/g, ""));
    }

    return uniqueStrings(aliases.filter(Boolean));
  }

  function splitCompositePropertyKey(key) {
    var text = stringifyValue(key).trim();
    if (!text) {
      return null;
    }

    var separators = [" - ", "~", ".", ":", "/", ">"];
    for (var i = 0; i < separators.length; i += 1) {
      var separator = separators[i];
      var index = text.indexOf(separator);
      if (index <= 0) {
        continue;
      }

      var propertySet = text.slice(0, index).trim();
      var propertyName = text.slice(index + separator.length).trim();
      if (propertySet && propertyName) {
        return {
          propertySet: propertySet,
          propertyName: propertyName,
        };
      }
    }

    return null;
  }

  function extractScalarPropertyValue(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    var scalar = firstDefined([
      value.value,
      value.nominalValue,
      value.displayValue,
      value.Value,
    ]);
    if (typeof scalar === "undefined") {
      return null;
    }

    return stringifyValue(scalar);
  }

  function assignPropertyValue(propertySets, propertySet, propertyName, value) {
    if (!propertySet || !propertyName) {
      return;
    }

    propertySets[propertySet] = propertySets[propertySet] || {};
    propertySets[propertySet][propertyName] = stringifyValue(value);
  }

  function compactObject(object) {
    var result = {};

    Object.keys(object || {}).forEach(function (key) {
      var value = object[key];
      if (value === "" || value === null || typeof value === "undefined") {
        return;
      }
      result[key] = value;
    });

    return result;
  }

  function normalizeComparisonText(value) {
    var stringValue = repairCommonMojibake(stringifyValue(value));
    if (!stringValue) {
      return "";
    }

    var normalized = stringValue
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (typeof normalized.normalize === "function") {
      normalized = normalized.normalize("NFKC");
    }
    return normalized.toLowerCase();
  }

  function repairCommonMojibake(value) {
    return String(value || "")
      .replace(/\u00c3\u00a6/g, "\u00e6")
      .replace(/\u00c3\u00b8/g, "\u00f8")
      .replace(/\u00c3\u00a5/g, "\u00e5")
      .replace(/\u00c3\u2020/g, "\u00c6")
      .replace(/\u00c3\u02dc/g, "\u00d8")
      .replace(/\u00c3\u2026/g, "\u00c5");
  }

  function foldNordicCharacters(value) {
    var normalized = String(value || "");
    if (typeof normalized.normalize === "function") {
      normalized = normalized.normalize("NFKD");
    }

    return normalized
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00e6/g, "ae")
      .replace(/\u00f8/g, "o")
      .replace(/\u00e5/g, "a")
      .replace(/\u00c6/g, "ae")
      .replace(/\u00d8/g, "o")
      .replace(/\u00c5/g, "a")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function sanitizeLabel(value) {
    return (
      String(value || "")
        .replace(/\s+/g, "-")
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 48) || "scope"
    );
  }

  function isLikelyMetadataKey(key) {
    return (
      [
        "id",
        "guid",
        "globalid",
        "ifcguid",
        "name",
        "title",
        "label",
        "type",
        "ifcclass",
        "model",
        "modelname",
        "layer",
        "layername",
        "filename",
        "documentname",
      ].indexOf(normalizeComparisonText(key)) !== -1
    );
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
