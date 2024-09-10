import proj4 from "proj4";

proj4.defs("EPSG:4612","+proj=longlat +ellps=GRS80 +no_defs +type=crs");
proj4.defs("EPSG:6668","+proj=longlat +ellps=GRS80 +no_defs +type=crs");

export default proj4;
