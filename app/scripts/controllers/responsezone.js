'use strict';

/**
 * @ngdoc function
 * @name hydrantsDashboardApp.controller:ResponsezoneCtrl
 * @description
 * # ResponsezoneCtrl
 * Controller of the hydrantsDashboardApp
 */
angular.module('hydrantsDashboard')
  .controller('ResponsezoneCtrl', ['$scope', '$route', '$routeParams', '$location', 'FIREDEPTS', 'agsFactory', 'leafletData', '$filter', '$interval', 'hydrantStats', 'hydrantEvents', '$timeout', '$localStorage', 'icons',
    function ($scope, $route, $routeParams, $location, FIREDEPTS, agsFactory, leafletData, $filter, $interval, hydrantStats, hydrantEvents, $timeout, $localStorage, icons) {


    //Get Route Details
    //  $scope.$route = $route;
    //  $scope.$location = $location;
     $scope.$routeParams = $routeParams;

     agsFactory.isTokenValid($localStorage.expires);

     $scope.token = $localStorage.token;

     $scope.responseZone = $routeParams.zone;

     FIREDEPTS.forEach(function(dept){
       if (dept.title === $scope.responseZone){
         $scope.badge = dept.icon;
       }
     });

     //Base map setup
     angular.extend($scope, {
       defaults: {
           zoomControl: false
       },

       layers: {
         baselayers: {
           osm: {
             name: 'OpenStreetMap',
             url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
             type: 'xyz',
             layerParams: {},
             layerOptions: {}
				   },
         },
           overlays: {
             Hydrants: {
 					    name: 'Hydrants',
 					    type: 'dynamic',
 					    url: 'http://maps.raleighnc.gov/arcgis/rest/services/PublicUtility/FireHydrants/MapServer',
 					    visible: true,
              layerParams: {
                token: $scope.token
              },
 					    layerOptions: {
 					      layers: [0, 1],
 				        opacity: 0.5,
 				        attribution: 'Copyright:© 2015 City of Raleigh',
                position: 'back'
 					    }
 				    },
           }
        },
    });



     //Feature group to store map bounds
     var mapBounds =  new L.FeatureGroup();

     var repairSelections = new L.FeatureGroup();

     //Placeholder for hydrant selection
     $scope.selectedHydrant = {};

     //Hydrants reference used in search
     $scope.hydrantRef = {};

     //Map filters
     $scope.mapFilterOptions = hydrantEvents.filters;
     $scope.mapFilterSelection = hydrantEvents.filters[0];

     $scope.updateFilter = function(){
       angular.extend($scope, {
         geojson: {
             data: $scope.geojson.data,
             pointToLayer: function (feature, latlng) {
               return L.circleMarker(latlng, hydrantEvents.setHydrantStyle);
             },
             style: $scope.mapFilterSelection.style,
             resetStyleOnMouseout: true
         },
         legend: $scope.mapFilterSelection.legend
     });
   };

     //Set current date
     $interval(function(){
       $scope.today = $filter('date')(new Date(), 'short');
     }, 1000);

     //Set options for query
     var options = {
       serviceArea: {
        layer: 'Combined Fire Response',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        geojson: true,
        actions: 'query',
        params: {
          token: $scope.token,
          f: 'json',
          text: $scope.responseZone,
          outSR: 4326
        }
      },
      hydrants: {
        layer: 'Fire Hydrants',
        geojson: true,
        actions: 'query',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        params: {
          token: $scope.token,
          f: 'json',
          geometryType: 'esriGeometryPolygon',
          outFields: 'STNUM, ISSUE1, ISSUE2, SERVICEDBY, FLOWDATE, STENUM, STPREFIX, STNAME, STTYPE, STSUFFIX, OWNEDBY, MANUFACTURER, HYDRANTYEAR, VALVESIZE, PUMPERNOZZLETYPE, SIDENOZZLETYPE, OPERABLE, REPAIRNEED, NOTES, RFD_NOTES, FACILITYID, CHECKED, JURISID, RFDSTATION, EDITEDON, CREATEDON',
          inSR: 4326,
          outSR: 4326,
          spatialRel: 'esriSpatialRelContains'
        }
      }
    };

    //Map Events
    leafletData.getMap().then(function(map) {


      $scope.$on('leafletDirectiveMap.geojsonMouseover', function(ev, feature, leafletEvent) {
        $scope.selectedHydrant = hydrantEvents.hydrantMouseover(feature, leafletEvent);
      });

      $scope.$on('leafletDirectiveMap.geojsonClick', function(ev, featureSelected, leafletEvent) {
          hydrantEvents.zoomToFeature(featureSelected);
      });

      //Controls hover events on needs repairs table
      $scope.zoomToFeature = function(feature){
        //Clear last features
        repairSelections.clearLayers();

        if ($scope.selectedHydrant.properties){
          $scope.selectedHydrant.properties = feature.attributes;
        }
        else{
          $scope.selectedHydrant = {};
          $scope.selectedHydrant.properties = feature.attributes;
        }

        map.setView([feature.geom.coordinates[1], feature.geom.coordinates[0]], 18);

        //Sets the highlight for selected repair feature
        var layer  = L.circleMarker([feature.geom.coordinates[1], feature.geom.coordinates[0]]);
        layer.setStyle({
          radius: 16,
          fillColor: '#00ffe6',
          color: '#000',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        });
        repairSelections.addLayer(layer);
        repairSelections.addTo(map);
        repairSelections.bringToBack();
      };

      //Clear the last selected feature for the repairs list when user leaves the table
      $scope.clearFeature = function(){
        //Clear last features
        repairSelections.clearLayers();
      }


      //Controls search bar above map
      $scope.searchMap = function(event, textFilter, geojson){
        //Set timeout to return promise
        $scope.searchPromise = $timeout(function(){
          //Filter geometry base on search text
          geojson.data.features = $filter('filter')($scope.hydrantRef.features, {$:textFilter});
          //Add new geojson scope
          angular.extend($scope, {
            geojson: {
                data: geojson.data,
                pointToLayer: function (feature, latlng) {
                  return L.circleMarker(latlng, hydrantEvents.setHydrantStyle);
                },
                style: hydrantEvents.setHydrantStyle,
                resetStyleOnMouseout: true
            }
          });

          //Clear current layers from feature group
          mapBounds.clearLayers();
          var enveloped = turf.envelope(geojson.data);
          L.geoJson(enveloped,{
            onEachFeature: function (feature, layer){
              mapBounds.addLayer(layer);
            }
          });

          //Zoom to searched region
          map.fitBounds(mapBounds.getBounds());


        }, 500);

      };

     });


      $scope.serviceAreas;

      agsFactory.publicUtilMS.request(options.serviceArea)
      // agsFactory.publicSafteyMS.request(options.serviceArea)
        .then(function(res){


          $scope.serviceAreas = turf.combine(res);
          // console.log($scope.serviceAreas);
          // var enveloped = turf.envelope($scope.serviceAreas);
          // var districts = Terraformer.ArcGIS.convert(enveloped.geometry);


          var simplified = turf.simplify(res.features[0], 0.02, true);

          var districts = Terraformer.ArcGIS.convert(simplified.geometry);



          //Empties exisiting feature group
          mapBounds.clearLayers();


        leafletData.getMap().then(function(map) {
          //Sets geojson object and adds each layer to featureGroup as a layer, so it can be edited
          L.geoJson($scope.serviceAreas, {
            style: {
                fillColor: 'rgba(50, 173, 2, 0.74)',
                weight: 2,
                opacity: 1,
                color: '#fff',
                dashArray: '3',
                fillOpacity: 0.7
            },
            onEachFeature: function (feature, layer) {
              mapBounds.addLayer(layer);
            }
          }).addTo(map);
          //Get bounds from geojson and fits to map
          map.fitBounds(mapBounds.getBounds());

          //Adding zoom control needs to happen here so that it adopts the init map bounds for the home button
          var zoomHome = L.Control.zoomHome();
              zoomHome.addTo(map);
      });

          return districts;
        }, function(err){
          console.log('Error: Cannot retrieve response zones');
        })
        .then(function(districts){

          //Set bounds for query
          options.hydrants.params.geometry = districts;

          // Make request to hydrants
          // agsFactory.publicUtilFS.request(options.hydrants)

          //start
          // hydrantStats.getCheckedStats(districts).then(function(res){
          //   console.log(res);
          // });

          $scope.hydrantPromise = agsFactory.publicUtilFS.request(options.hydrants);

          $scope.hydrantPromise.then(function(res){
              console.log(res);
              try{
                if (typeof res !== 'object') throw {error: 'Please login'};
              }
              catch (err){
                console.log(err);
                return;
              }
              // hydrantStats.addDomains(res.features, function(features){
              //   res.features = features
              // });
              angular.copy(res, $scope.hydrantRef);

          //Add hydrants to map
              angular.extend($scope, {
                geojson: {
                    data: res,
                    pointToLayer: function (feature, latlng) {
                      return L.circleMarker(latlng, hydrantEvents.setHydrantStyle);
                      // return L.marker(latlng, {icon: L.icon(icons.public)});
                    },
                    style: $scope.mapFilterSelection.style,
                    resetStyleOnMouseout: true
                },
                legend: $scope.mapFilterSelection.legend
            });

            //Generate map reports
            hydrantStats.getReport(res.features, function(report){
              $scope.reportTotals = report;
              $scope.needsRepair = [
                {
                  status: true,
                  data: report.needsRepairPublic,
                  name: 'Needs Repair Public'
                },
                {
                  status: false,
                  data: report.needsRepairPrivate,
                  name: 'Needs Repair Private'
                }
              ];
              $scope.selected = $scope.needsRepair[0];
              if ($scope.needsRepair[0].data[0]){
                $scope.headers = Object.keys($scope.needsRepair[0].data[0].attributes);
              }


              //Prepares data to print
              $scope.printCSV = function(data){
                var csv = [];
                data.forEach(function(feature){
                  csv.push(feature.attributes);
                });
                return csv;
              };

            });


            }, function(err){
              console.log('Error: Cannot retrieve hydrants');
            });

        }, function(err){
          console.log('Error: Cannot retrieve districts');
        });

        $scope.$watch('reportTotals', function(){});
        $scope.$watch('needsRepair', function(){});


  }]);
