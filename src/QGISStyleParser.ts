import {
  Filter,
  StyleParser,
  Style,
  Rule,
  // ComparisonOperator,
  // CombinationOperator,
  ScaleDenominator,
  PointSymbolizer,
  Symbolizer,
  IconSymbolizer,
  // LineSymbolizer,
  // FillSymbolizer,
  // TextSymbolizer,
  // ComparisonFilter,
  MarkSymbolizer,
  WellKnownName
} from 'geostyler-style';

import { CqlParser } from 'geostyler-cql-parser';

const Color = require('color');

import {
  parseString,
  Builder
} from 'xml2js';

// const _isString = require('lodash/isString');
// const _isNumber = require('lodash/isNumber');
const _get = require('lodash/get');
// const _set = require('lodash/set');

type SymbolizerMap = {
  [key: string]: Symbolizer[]
};

type QmlProp = {
  $: {
    k: any,
    v: any
  }
};

type QmlRule = {
  $: {
    filter?: string,
    scalemaxdenom?: number,
    scalemindenom?: number,
    symbol: string,
    key: string
  }
};

type QmlCategory = {
  $: {
    label: string,
    render: string,
    symbol: string,
    value: string
  }
};

type QmlRange = {
  $: {
    upper: string,
    lower: string,
    label: string,
    symbol: string,
    render: string,
  }
};

/**
 * This parser can be used with the GeoStyler.
 * It implements the GeoStyler-Style StyleParser interface.
 *
 * @class QGISStyleParser
 * @implements StyleParser
 */
export class QGISStyleParser implements StyleParser {

  cqlParser = new CqlParser();

  /**
   * The name of the QGIS Style Parser.
   */
  public static title = 'QGIS Style Parser';

  /**
   * The readStyle implementation of the GeoStyler-Style StyleParser interface.
   * It reads a QML as a string and returns a Promise.
   * The Promise itself resolves with a GeoStyler-Style Style.
   *
   * @param {string} qmlString A QML as a string.
   * @return {Promise} The Promise resolving with the GeoStyler-Style Style
   */
  readStyle(qmlString: string): Promise<Style> {
    return new Promise<Style>((resolve, reject) => {
      const options = {};
      try {
        parseString(qmlString, options, (err: any, result: any) => {
          if (err) {
            reject(`Error while parsing qmlString: ${err}`);
          }
          const geoStylerStyle: Style = this.qmlObjectToGeoStylerStyle(result);
          resolve(geoStylerStyle);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get the GeoStyler-Style Style from an QML Object (created with xml2js).
   *
   * @param {object} qmlObject The QML object representation (created with xml2js)
   * @return {Style} The GeoStyler-Style Style
   */
  qmlObjectToGeoStylerStyle(qmlObject: object): Style {
    const rules = this.getRulesFromQmlObject(qmlObject);
    return {
      name: 'QGIS Style',
      rules
    };
  }

  /**
   * Get the GeoStyler-Style Rule from an QML Object (created with xml2js).
   *
   * @param {object} qmlObject The QML object representation (created with xml2js)
   * @return {Rule} The GeoStyler-Style Rule
   */
  getRulesFromQmlObject(qmlObject: any): Rule[] {
    const qmlRules: QmlRule[] = _get(qmlObject, 'qgis.renderer-v2.[0].rules[0].rule');
    const qmlCategories: QmlCategory[] = _get(qmlObject, 'qgis.renderer-v2.[0].categories[0].category');
    const qmlRanges: QmlRange[] = _get(qmlObject, 'qgis.renderer-v2.[0].ranges[0].range');
    const qmlSymbols = _get(qmlObject, 'qgis.renderer-v2.[0].symbols[0].symbol');
    let rules: Rule[] = [];
    const symbolizerMap = this.parseQmlSymbolizers(qmlSymbols);
    if (Array.isArray(qmlRules) && qmlRules.length > 0) {
      qmlRules.forEach((qmlRule: QmlRule, index: number) => {
        const filter: Filter | undefined = this.getFilterFromQmlRule(qmlRule);
        const scaleDenominator: ScaleDenominator | undefined = this.getScaleDenominatorFromRule(qmlRule);
        const name = qmlRule.$.filter;
        let rule: Rule = <Rule> {
          name
        };
        if (filter) {
          rule.filter = filter;
        }
        if (scaleDenominator) {
          rule.scaleDenominator = scaleDenominator;
        }
        if (symbolizerMap && symbolizerMap[qmlRule.$.symbol]) {
          rule.symbolizers = symbolizerMap[qmlRule.$.symbol];
        }
        rules.push(rule);
      });
    } else if (Array.isArray(qmlCategories) && qmlCategories.length > 0) {
      const attribute = _get(qmlObject, 'qgis.renderer-v2.[0].$.attr');
      qmlCategories.forEach((qmlCategory: QmlCategory, index: number) => {
        const value = qmlCategory.$.value;
        const filter = ['==', attribute, value];
        const name = `${attribute} = ${value}`;
        let rule: Rule = <Rule> {
          name,
          filter
        };
        if (symbolizerMap && symbolizerMap[qmlCategory.$.symbol]) {
          rule.symbolizers = symbolizerMap[qmlCategory.$.symbol];
        }
        rules.push(rule);
      });
    } else if (Array.isArray(qmlRanges) && qmlRanges.length > 0) {
      const attribute = _get(qmlObject, 'qgis.renderer-v2.[0].$.attr');
      qmlRanges.forEach((qmlRange: QmlRange, index: number) => {
        const name = qmlRange.$.label;
        const lower = qmlRange.$.lower;
        const upper = qmlRange.$.upper;
        const filter = [
          '&&',
          ['>=', attribute, lower],
          ['<=', attribute, upper]
        ]  ;
        let rule: Rule = <Rule> {
          name,
          filter
        };
        if (symbolizerMap && symbolizerMap[qmlRange.$.symbol]) {
          rule.symbolizers = symbolizerMap[qmlRange.$.symbol];
        }
        rules.push(rule);
      });
    } else {
      const symbolizers = symbolizerMap[Object.keys(symbolizerMap)[0]];
      const rule: Rule = {
        name: 'QGIS Simple Symbol',
        symbolizers
      };
      rules.push(rule);
    }

    return rules;
  }

  /**
   * Get the GeoStyler-Style Filter from an QML Rule.
   *
   * Currently only supports one Filter per Rule.
   *
   * @param {object} qmlRule The QML Rule
   * @return {Filter} The GeoStyler-Style Filter
   */
  getFilterFromQmlRule(qmlRule: QmlRule): Filter | undefined {
    const qmlFilter = _get(qmlRule, '$.filter');
    let filter: Filter;
    if (qmlFilter) {
      filter = this.cqlParser.read(qmlFilter);
      return filter;
    }
    return undefined;
  }

  /**
   * Get the GeoStyler-Style ScaleDenominator from an QML Rule.
   *
   * @param {object} qmlRule The QML Rule
   * @return {ScaleDenominator} The GeoStyler-Style ScaleDenominator
   */
  getScaleDenominatorFromRule(qmlRule: QmlRule): ScaleDenominator | undefined {
    const maxScaleDenominator = _get(qmlRule, '$.scalemaxdenom');
    const minScaleDenominator = _get(qmlRule, '$.scalemindenom');
    let scaleDenominator: ScaleDenominator = <ScaleDenominator> {};
    if (minScaleDenominator) {
      scaleDenominator.min = parseFloat(minScaleDenominator);
    }
    if (maxScaleDenominator) {
      scaleDenominator.max = parseFloat(maxScaleDenominator);
    }

    return (scaleDenominator.min || scaleDenominator.max)
      ? scaleDenominator
      : undefined;
  }

  /**
   *
   */
  parseQmlSymbolizers(qmlSymbolizers: any[]): SymbolizerMap {
    const symbolizerMap: SymbolizerMap = {};

    qmlSymbolizers.forEach((qmlSymbolizer: any) => {
      const symbolizerKey = _get(qmlSymbolizer, '$.name');
      const symbolizerType = _get(qmlSymbolizer, '$.type');
      let symbolizers;
      switch (symbolizerType) {
        case 'marker':
          symbolizers = this.getPointSymbolizersFromQmlSymbolizer(qmlSymbolizer);
          break;
        // case 'LineSymbolizer':
        //   symbolizer = this.getLineSymbolizerFromQGISSymbolizer(qmlSymbolizer);
        //   break;
        // case 'TextSymbolizer':
        //   symbolizer = this.getTextSymbolizerFromQGISSymbolizer(qmlSymbolizer);
        //   break;
        // case 'PolygonSymbolizer':
        //   symbolizer = this.getFillSymbolizerFromQGISSymbolizer(qmlSymbolizer);
        //   break;
        default:
          throw new Error('Failed to parse SymbolizerKind from qmlSymbolizer');
      }
      symbolizerMap[symbolizerKey] = symbolizers;
    });

    return symbolizerMap;
  }

  /**
   * Get the GeoStyler-Style PointSymbolizer from an QGIS Symbolizer.
   *
   * The opacity of the Symbolizer is taken from the <Graphic>.
   *
   * @param {object} qmlSymbolizer The QGIS Symbolizer
   * @return {PointSymbolizer} The GeoStyler-Style PointSymbolizer
   */
  getPointSymbolizersFromQmlSymbolizer(qmlSymbolizer: any): PointSymbolizer[] {
    return qmlSymbolizer.layer.map((symbolizerLayer: any) => {
      const markerClass = symbolizerLayer.$.class;
      switch (markerClass) {
        case 'SimpleMarker':
          return this.getPointSymbolizerFromMarkLayer(symbolizerLayer);
        case 'SvgMarker':
          return this.getPointSymbolizerFromSvgLayer(symbolizerLayer);
        default:
          throw new Error(`Failed to parse MarkerClass ${markerClass} from qmlSymbolizer`);
      }
    });
  }

  /**
   * Get the GeoStyler-Style MarkSymbolizer from an QML Symbolizer
   *
   * @param {object} qmlSymbolizer The QML Symbolizer
   * @return {MarkSymbolizer} The GeoStyler-Style MarkSymbolizer
   */
  getPointSymbolizerFromMarkLayer(qmlSymbolizer: any): MarkSymbolizer {
    let markSymbolizer: MarkSymbolizer = {
      kind: 'Mark',
    } as MarkSymbolizer;

    const qmlMarkerProps: any = {};

    qmlSymbolizer.prop.forEach((prop: QmlProp) => {
      const key = prop.$.k;
      const value = prop.$.v;
      qmlMarkerProps[key] = value;
    });
    const wellKnownName: string = qmlMarkerProps.name;
    const wkn = wellKnownName.charAt(0).toUpperCase() + wellKnownName.slice(1);
    markSymbolizer.wellKnownName = wkn as WellKnownName;

    if (qmlMarkerProps.color) {
      const colorArray = qmlMarkerProps.color.split(',');
      markSymbolizer.opacity = parseFloat(colorArray[3]) / 255;
      const color = Color(`rgb(${colorArray[0]},${colorArray[1]},${colorArray[2]})`);
      markSymbolizer.color = color.hex();
    }

    if (qmlMarkerProps.angle) {
      markSymbolizer.rotate = parseFloat(qmlMarkerProps.angle);
    }
    if (qmlMarkerProps.size) {
      markSymbolizer.radius = parseFloat(qmlMarkerProps.size);
    }
    // TODO Fix in style declaration
    // if (qmlMarkerProps.offset) {
    //   markSymbolizer.offset = qmlMarkerProps.offset.split(',').map(parseFloat);
    // }
    if (qmlMarkerProps.outline_color) {
      const colorArray = qmlMarkerProps.outline_color.split(',');
      markSymbolizer.strokeOpacity = parseFloat(colorArray[3]) / 255;
      const color = Color(`rgb(${colorArray[0]},${colorArray[1]},${colorArray[2]})`);
      markSymbolizer.strokeColor = color.hex();
    }
    if (qmlMarkerProps.outline_width) {
      markSymbolizer.strokeWidth = parseFloat(qmlMarkerProps.outline_width);
    }

    return markSymbolizer;
  }

  /**
   * Get the GeoStyler-Style IconSymbolizer from an QML Symbolizer
   *
   * @param {object} qmlSymbolizer The QML Symbolizer
   * @return {IconSymbolizer} The GeoStyler-Style IconSymbolizer
   */
  getPointSymbolizerFromSvgLayer(qmlSymbolizer: any): IconSymbolizer {
    let iconSymbolizer: IconSymbolizer = {
      kind: 'Icon',
    } as IconSymbolizer;

    const qmlMarkerProps: any = {};

    qmlSymbolizer.prop.forEach((prop: QmlProp) => {
      const key = prop.$.k;
      const value = prop.$.v;
      qmlMarkerProps[key] = value;
    });

    if (qmlMarkerProps.color) {
      const colorArray = qmlMarkerProps.color.split(',');
      iconSymbolizer.opacity = parseFloat(colorArray[3]) / 255;
      const color = Color(`rgb(${colorArray[0]},${colorArray[1]},${colorArray[2]})`);
      iconSymbolizer.color = color.hex();
    }

    if (qmlMarkerProps.angle) {
      iconSymbolizer.rotate = parseFloat(qmlMarkerProps.angle);
    }
    if (qmlMarkerProps.size) {
      iconSymbolizer.size = parseFloat(qmlMarkerProps.size);
    }
    if (qmlMarkerProps.offset) {
      const offsetArray = qmlMarkerProps.offset.split(',').map(parseFloat);
      if (offsetArray[0] > 0 || offsetArray[1] > 0) {
        iconSymbolizer.offset = qmlMarkerProps.offset.split(',').map(parseFloat);
      }
    }
    if (qmlMarkerProps.name) {
      iconSymbolizer.image = qmlMarkerProps.name;
    }

    return iconSymbolizer;
  }

  /**
   * Get the GeoStyler-Style IconSymbolizer from an QGIS Symbolizer
   *
   * @param {object} qGISSymbolizer The QGIS Symbolizer
   * @return {IconSymbolizer} The GeoStyler-Style IconSymbolizer
   */
  getIconSymbolizerFromQGISSymbolizer(qGISSymbolizer: any): IconSymbolizer {
    const onlineResource = _get(qGISSymbolizer, 'Graphic[0].ExternalGraphic[0].OnlineResource[0]');
    let iconSymbolizer: IconSymbolizer = <IconSymbolizer> {
      kind: 'Icon',
      image: onlineResource.$['xlink:href']
    };
    const opacity = _get(qGISSymbolizer, 'Graphic[0].Opacity[0]');
    const size = _get(qGISSymbolizer, 'Graphic[0].Size[0]');
    const rotate = _get(qGISSymbolizer, 'Graphic[0].Rotation[0]');
    if (opacity) {
      iconSymbolizer.opacity = opacity;
    }
    if (size) {
      iconSymbolizer.size = parseInt(size, 10);
    }
    if (rotate) {
      iconSymbolizer.rotate = parseInt(rotate, 10);
    }

    return iconSymbolizer;
  }

  /**
   * The writeStyle implementation of the GeoStyler-Style StyleParser interface.
   * It reads a GeoStyler-Style Style and returns a Promise.
   * The Promise itself resolves with a QML string.
   *
   * @param {Style} geoStylerStyle A GeoStyler-Style Style.
   * @return {Promise} The Promise resolving with the QML as a string.
   */
  writeStyle(geoStylerStyle: Style): Promise<string> {
    return new Promise<any>((resolve, reject) => {
      try {
        const builder = new Builder();
        const qmlObject = this.geoStylerStyleToQmlObject(geoStylerStyle);
        const qmlString = builder.buildObject(qmlObject);
        resolve(qmlString);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get the QML Object (readable with xml2js) from an GeoStyler-Style Style
   *
   * @param {Style} geoStylerStyle A GeoStyler-Style Style.
   * @return {object} The object representation of a QML Style (readable with xml2js)
   */
  geoStylerStyleToQmlObject(geoStylerStyle: Style): any {
    const rules: any[] = [];
    rules.forEach(rule => {return {name}; });
    return {};
  }

}

export default QGISStyleParser;
