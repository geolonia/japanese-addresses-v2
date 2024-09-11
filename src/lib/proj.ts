import proj4 from "proj4";
import { LngLat } from "../data.js";

proj4.defs("EPSG:4612","+proj=longlat +ellps=GRS80 +no_defs +type=crs");
proj4.defs("EPSG:6668","+proj=longlat +ellps=GRS80 +no_defs +type=crs");

export default proj4;

type DataRowWithGeometry = {
  rep_lon: string
  rep_lat: string
  rep_srid: string
};

/**
 * Reprojects Address Base Registry lon/lat data to EPSG:4326
 * @returns
 */
export function projectABRData(dataRow: DataRowWithGeometry): LngLat {
  const input: LngLat = [parseFloat(dataRow.rep_lon), parseFloat(dataRow.rep_lat)];
  return proj4(dataRow.rep_srid, "EPSG:4326", input);
}
