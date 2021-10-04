import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Map, View, Feature } from 'ol';
import { createXYZ } from 'ol/tilegrid';
import { MVT, GeoJSON, WKT } from 'ol/format';
import { VectorTile, Tile, Vector as VectorLayer } from 'ol/layer';
import { OSM, Vector, VectorTile as VectorTileSource } from 'ol/source';
import { Fill, Stroke, Circle, Style, Icon } from 'ol/style';
import { Point } from 'ol/geom';

// @ts-ignore
import LayerSwitcher from 'ol-ext/control/LayerSwitcher';
// @ts-ignore
import { applyStyle } from 'ol-mapbox-style';
// @ts-ignore
import * as Gp from 'geoportal-extensions-openlayers';

import { GeolocationService } from '../../../services/geolocation.service';
import { ItineraryService } from '../../../services/itinerary.service';
import { SettingsParserService } from '../../../services/settings-parser.service';

@Component({
  selector: 'app-map-container',
  templateUrl: './map-ol-container.component.html',
  styleUrls: ['./map-ol-container.component.scss']
})
export class MapOlContainerComponent implements OnInit, OnDestroy {
  private readonly ignKey = 'choisirgeoportail';
  private map?: Map;
  private view?: View;

  // Subject for unsubscription
  private readonly $destroy = new Subject();

  constructor(
    private geoService: GeolocationService,
    private itineraryService: ItineraryService,
    private settingsService: SettingsParserService,
  ) {

    this.geoService.onPointSet()
      .pipe(takeUntil(this.$destroy))
      .subscribe((point) => {
        this.map?.getLayers().getArray()
          .filter(layer => layer.get('title') === 'point')
          .forEach(layer => this.map?.removeLayer(layer));

        const iconStyle = new Style({
          image: new Icon({
            src: 'assets/location-check-solid.png',
          }),
        });

        const features = new GeoJSON().readFeatures(point, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        features[0]?.setStyle(iconStyle);
        const vectorSource = new Vector({
          features
        });
        const vectorLayer = new VectorLayer({
          // @ts-ignore
          title: 'point',
          source: vectorSource,
        });
        this.map?.addLayer(vectorLayer);

        const feature = vectorSource.getFeatures()[0];
        const target = feature.getGeometry();
        // @ts-ignore
        this.view?.fit(target, { padding: [50, 50, 50, 50], minResolution: 3 });
      });

    this.itineraryService.onItinerarySet()
      .pipe(takeUntil(this.$destroy))
      .subscribe((itinerary) => {
        this.map?.getLayers().getArray()
          .filter(layer => layer.get('title') === 'itinerary')
          .forEach(layer => this.map?.removeLayer(layer));
        const format = new WKT();
        const feature = format.readFeature(itinerary, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        const vectorSource = new Vector({ features: [feature] });
        const vectorLayer = new VectorLayer({
          // @ts-ignore
          title: 'itinerary',
          source: vectorSource,
          style: new Style({
            stroke: new Stroke({
              color: 'rgba(0,0,0,0.7)',
              width: 3,
            }),
          }),
        });
        this.map?.addLayer(vectorLayer);
        this.view?.fit(
          vectorSource.getExtent(),
          { padding: [50, 50, 50, 50], minResolution: 3 }
        );
      });
  }

  // Display MapLayers
  private displayLayers = (): void => {
    const maps = this.settingsService.getSettings().maps.ol;

    const lsControl = new LayerSwitcher({
      collapsed: true,
      reordering: false,
      selection: true
    });
    this.map?.addControl(lsControl);

    // OpenStreetMap Layer
    const osmLayer = new Tile({
      // @ts-ignore
      title: maps.osmRaster.title,
      baseLayer: true,
      source: new OSM()
    });
    this.map?.addLayer(osmLayer);

    // IGN Vector Layer
    const ignOLLayer = new VectorTile({
      // @ts-ignore
      title: maps.ignVector.title,
      baseLayer: true,
      visible: false,
      source: new VectorTileSource({
        format: new MVT(),
        url: maps.ignVector.tileUrl,
        tileGrid: createXYZ({
          maxZoom: 22,
          minZoom: 1,
          tileSize: 256
        }),
        attributions: [
          '<a href="https://geoservices.ign.fr/documentation/geoservices/vecteur-tuile.html">© IGN</a></br>',
          '<a href="https://github.com/gaetanbloch">© GBloch</a>'
        ]
      }),
      declutter: true
    });
    this.map?.addLayer(ignOLLayer);

    // Fetch style IIFE
    (async () => {
      const plan = await fetch(maps.ignVector.styleUrl);
      const style = await plan.json();
      const setStyle = async () => {
        applyStyle(ignOLLayer, style, 'plan_ign');
      };
      if (ignOLLayer.getSource()) {
        await setStyle();
      } else {
        ignOLLayer.once('change:source', setStyle);
      }
    })().catch(console.error);
  };

  // Init component
  ngOnInit(): void {
    this.view = new View({
      center: [287963, 5948655],
      zoom: 6,
      constrainResolution: true,
      maxZoom: 22,
      minZoom: 0
    });
    this.map = new Map({
      target: 'map',
      view: this.view
    });

    // Connection to Geoportal server
    Gp.Services.getConfig({
      // Or download the file from https://ignf.github.io/geoportal-access-lib/latest/jsdoc/tutorial-optimize-getconfig.html
      apiKey: this.ignKey,
      onSuccess: this.displayLayers
    });
  }

  ngOnDestroy(): void {
    // Unsubscriptions
    this.$destroy.next();
    this.$destroy.complete();
  }
}
