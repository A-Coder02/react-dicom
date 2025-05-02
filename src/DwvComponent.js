import React from "react";
import PropTypes from "prop-types";
import { withStyles, useTheme } from "@mui/styles";

import Stack from "@mui/material/Stack";
import LinearProgress from "@mui/material/LinearProgress";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import { toPng, toJpeg, toBlob } from "html-to-image";
// https://mui.com/material-ui/material-icons/

import ContrastIcon from "@mui/icons-material/Contrast";
import SearchIcon from "@mui/icons-material/Search";
import StraightenIcon from "@mui/icons-material/Straighten";

import Slide from "@mui/material/Slide";

import "./DwvComponent.css";
import { App, getDwvVersion, decoderScripts } from "dwv";
import { InvertColors, PlayArrow, RotateLeft } from "@mui/icons-material";
import { Box, Button, Typography } from "@mui/material";
import { grey } from "@mui/material/colors";

console.log({ url: process.env.PUBLIC_URL });

// Image decoders (for web workers)
decoderScripts.jpeg2000 = `${process.env.PUBLIC_URL}/assets/dwv/decoders/pdfjs/decode-jpeg2000.js`;
decoderScripts[
  "jpeg-lossless"
] = `${process.env.PUBLIC_URL}/assets/dwv/decoders/rii-mango/decode-jpegloss.js`;
decoderScripts[
  "jpeg-baseline"
] = `${process.env.PUBLIC_URL}/assets/dwv/decoders/pdfjs/decode-jpegbaseline.js`;
decoderScripts.rle = `${process.env.PUBLIC_URL}/assets/dwv/decoders/dwv/decode-rle.js`;

const styles = (theme) => ({
  appBar: {
    position: "relative",
  },
  title: {
    flex: "0 0 auto",
  },
  iconSmall: {
    fontSize: 20,
  },
});

export const TransitionUp = React.forwardRef((props, ref) => (
  <Slide direction="up" {...props} ref={ref} />
));

class DwvComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      versions: {
        dwv: getDwvVersion(),
        react: React.version,
      },
      tools: {
        Scroll: {},
        ZoomAndPan: {},
        WindowLevel: {},
        Draw: {
          options: ["Ruler", "Arrow", "Protractor", "Circle", "Rectangle"],
        },
        // Custom
        Invert: {},
        Rotate: {
          options: [0, 90, 180, 270],
          selected: 0,
        },
      },
      isInvert: false,
      rotateValue: 0,
      selectedTool: "WindowLevel",
      loadProgress: 0,
      dataLoaded: false,
      dwvApp: null,
      metaData: {},
      orientation: undefined,
      showDicomTags: false,
      dropboxDivId: "dropBox",
      dropboxClassName: "dropBox",
      borderClassName: "dropBoxBorder",
      hoverClassName: "hover",
    };
  }

  handleCapture = async () => {
    try {
      // Download as PNG
      await captureDivById("layerGroup0");

      // OR get as data URL
      const dataUrl = await captureDivById("layerGroup0", { download: false });
      console.log(dataUrl);

      // OR get as blob for upload
      const blob = await captureDivAsBlob("layerGroup0");
      // Upload blob to server...
    } catch (error) {
      console.error("Capture failed:", error);
    }
  };

  handleDownloadImage = async () => {
    try {
      const element = document.getElementById("layerGroup0");
      if (!element) {
        throw new Error("DICOM viewer element not found");
      }

      // Show loading state
      this.setState({ isDownloading: true });

      // Capture the div as PNG
      const dataUrl = await toPng(element, {
        quality: 1,
        backgroundColor: "#ffffff",
        pixelRatio: 2, // Higher resolution
      });

      // Create download link
      const link = document.createElement("a");
      link.download = `dicom-viewer-${new Date()
        .toISOString()
        .slice(0, 10)}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error downloading image:", error);
      this.setState({ error: "Failed to download image" });
    } finally {
      this.setState({ isDownloading: false });
    }
  };

  handlePrint = () => {
    const printWindow = window.open("", "_blank");
    const element = document.getElementById("layerGroup0");

    if (!element) {
      this.setState({ error: "DICOM viewer element not found" });
      return;
    }

    // Clone the element to avoid modifying the original
    const clone = element.cloneNode(true);

    // Create print-friendly HTML
    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DICOM Print</title>
          <style>
            body { margin: 0; padding: 20px; text-align: center; }
            img { max-width: 100%; height: auto; }
            .print-meta { 
              margin-bottom: 20px; 
              text-align: left;
              font-family: Arial, sans-serif;
            }
            @page { size: auto; margin: 0mm; }
          </style>
        </head>
        <body>
          <div class="print-meta">
            <h2>DICOM Study Print</h2>
            <p>Printed on: ${new Date().toLocaleString()}</p>
            ${
              this.state.metaData.PatientName
                ? `<p>Patient: ${this.state.metaData.PatientName}</p>`
                : ""
            }
          </div>
          <div id="print-content"></div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 200);
            };
          </script>
        </body>
      </html>
    `);

    // Append the cloned content
    const printContent = printWindow.document.getElementById("print-content");
    printContent.appendChild(clone);

    printWindow.document.close();
  };

  render() {
    console.log({ d: this.state.dwvApp });

    const { classes } = this.props;
    const { versions, tools, loadProgress, dataLoaded, metaData } = this.state;

    const handleToolChange = (event, newTool) => {
      if (newTool) {
        this.onChangeTool(newTool);
      }
    };
    const handleShapeChange = (event, newShape) => {
      if (newShape) {
        console.log({ event, newShape });
        this.onChangeShape(newShape);
      }
    };
    const toolsButtons = Object.keys(tools).map((tool) => (
      <ToggleButton
        value={tool}
        key={tool}
        title={tool}
        disabled={!dataLoaded || !this.canRunTool(tool)}
        onClick={() => {
          if (tool === "Invert") {
            this.setState({ isInvert: !this.state.isInvert });
          }
          if (tool === "Rotate") {
            this.setState({ rotateValue: this.state.rotateValue + 90 });
          }
        }}
      >
        {this.getToolIcon(tool)}
      </ToggleButton>
    ));

    const drawOptions = tools.Draw.options.map((shape) => (
      <ToggleButton
        value={shape}
        key={shape}
        title={shape}
        disabled={!dataLoaded || this.state.selectedTool !== "Draw"}
      >
        {shape}
      </ToggleButton>
    ));

    return (
      <div
        id="dwv"
        style={{
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <LinearProgress variant="determinate" value={loadProgress} />
        <Box
          direction="row"
          spacing={1}
          padding={1}
          // justifyContent="center"
          // alignItems={"center"}
          flexWrap="wrap"
          sx={{
            zIndex: 99999,
            position: "relative",
            backgroundColor: grey[900],
          }}
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            {/* Tool selection */}
            <Typography
              sx={{
                fontSize: "1.8rem",
                fontWeight: "500",
                color: "white",
              }}
            >
              Dicolite
            </Typography>
            <Stack
              gap={2}
              alignItems={"center"}
              justifyContent={"center"}
              sx={{
                height: "fit-content",
                width: "100%",
              }}
            >
              <Box display="flex" gap={2} alignItems="center">
                <ToggleButtonGroup
                  size="small"
                  color="primary"
                  variant="contained"
                  value={this.state.selectedTool}
                  exclusive
                  onChange={handleToolChange}
                  sx={{
                    backgroundColor: "white",
                    width: "fit-content",
                  }}
                >
                  {toolsButtons}
                </ToggleButtonGroup>
                {dataLoaded && (
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={!dataLoaded}
                    onClick={() => {
                      this.handleDownloadImage();
                    }}
                  >
                    Take Screenshot
                  </Button>
                )}
                {dataLoaded && (
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={!dataLoaded}
                    onClick={() => {
                      this.handlePrint();
                    }}
                  >
                    Print File
                  </Button>
                )}
              </Box>

              {/* Draw Options */}
              {this.state.selectedTool === "Draw" ? (
                <ToggleButtonGroup
                  size="small"
                  color="secondary"
                  value={this.state.selectedShape}
                  exclusive
                  onChange={handleShapeChange}
                  sx={{
                    backgroundColor: "white",
                  }}
                >
                  {drawOptions}
                </ToggleButtonGroup>
              ) : null}
            </Stack>
          </Box>
        </Box>

        <div
          id="layerGroup0"
          className="layerGroup"
          style={{
            filter: `invert(${this.state.isInvert ? 1 : 0})`,
            transform: `rotate(${this.state.rotateValue}deg)`,
            transformOrigin: "center",
            backgroundColor: "black",
            color: "white",
            height: "100%",
          }}
        >
          <div
            id="dropBox"
            style={{
              backgroundColor: "black!important",
            }}
          ></div>
        </div>
      </div>
    );
  }

  componentDidMount() {
    // create app
    const app = new App();
    // initialise app
    app.init({
      dataViewConfigs: { "*": [{ divId: "layerGroup0" }] },
      tools: this.state.tools,
    });

    // load events
    let nLoadItem = null;
    let nReceivedLoadError = null;
    let nReceivedLoadAbort = null;
    let isFirstRender = null;
    app.addEventListener("loadstart", (/*event*/) => {
      // reset flags
      nLoadItem = 0;
      nReceivedLoadError = 0;
      nReceivedLoadAbort = 0;
      isFirstRender = true;
      // hide drop box
      this.showDropbox(app, false);
    });
    app.addEventListener("loadprogress", (event) => {
      this.setState({ loadProgress: event.loaded });
    });
    app.addEventListener("renderend", (/*event*/) => {
      if (isFirstRender) {
        isFirstRender = false;
        // available tools
        let selectedTool = "ZoomAndPan";
        if (app.canScroll()) {
          selectedTool = "WindowLevel";
        }
        this.onChangeTool(selectedTool);
      }
    });
    app.addEventListener("load", (event) => {
      // set dicom tags
      this.setState({ metaData: app.getMetaData(event.dataid) });
      // set data loaded flag
      this.setState({ dataLoaded: true });
    });
    app.addEventListener("loadend", (/*event*/) => {
      if (nReceivedLoadError) {
        this.setState({ loadProgress: 0 });
        alert("Received errors during load. Check log for details.");
        // show drop box if nothing has been loaded
        if (!nLoadItem) {
          this.showDropbox(app, true);
        }
      }
      if (nReceivedLoadAbort) {
        this.setState({ loadProgress: 0 });
        alert("Load was aborted.");
        this.showDropbox(app, true);
      }
    });
    app.addEventListener("loaditem", (/*event*/) => {
      ++nLoadItem;
    });
    app.addEventListener("loaderror", (event) => {
      console.error(event.error);
      ++nReceivedLoadError;
    });
    app.addEventListener("loadabort", (/*event*/) => {
      ++nReceivedLoadAbort;
    });

    // handle key events
    app.addEventListener("keydown", (event) => {
      app.defaultOnKeydown(event);
    });
    // handle window resize
    window.addEventListener("resize", app.onResize);

    // store
    this.setState({ dwvApp: app });

    // setup drop box
    this.setupDropbox(app);

    // possible load from location
    app.loadFromUri(window.location.href);
  }

  /**
   * Get the icon of a tool.
   *
   * @param {string} tool The tool name.
   * @returns {Icon} The associated icon.
   */
  getToolIcon = (tool) => {
    let res;
    if (tool === "Scroll") {
      res = <PlayArrow />;
    } else if (tool === "ZoomAndPan") {
      res = <SearchIcon />;
    } else if (tool === "WindowLevel") {
      res = <ContrastIcon />;
    } else if (tool === "Draw") {
      res = <StraightenIcon />;
    } else if (tool === "Invert") {
      res = <InvertColors />;
    } else if (tool === "Rotate") {
      res = <RotateLeft />;
    }
    return res;
  };

  /**
   * Handle a change tool event.
   * @param {string} tool The new tool name.
   */
  onChangeTool = (tool) => {
    if (this.state.dwvApp) {
      this.setState({ selectedTool: tool });
      this.state.dwvApp.setTool(tool);
      if (tool === "Draw") {
        this.onChangeShape(this.state.tools.Draw.options[0]);
      }
    }
  };

  /**
   * Check if a tool can be run.
   *
   * @param {string} tool The tool name.
   * @returns {boolean} True if the tool can be run.
   */
  canRunTool = (tool) => {
    let res;
    if (tool === "Scroll") {
      res = this.state.dwvApp.canScroll();
    } else if (tool === "WindowLevel") {
      res = this.state.dwvApp.canWindowLevel();
    } else {
      res = true;
    }
    return res;
  };

  /**
   * Toogle the viewer orientation.
   */
  toggleOrientation = () => {
    if (typeof this.state.orientation !== "undefined") {
      if (this.state.orientation === "axial") {
        this.state.orientation = "coronal";
      } else if (this.state.orientation === "coronal") {
        this.state.orientation = "sagittal";
      } else if (this.state.orientation === "sagittal") {
        this.state.orientation = "axial";
      }
    } else {
      // default is most probably axial
      this.state.orientation = "coronal";
    }
    // update data view config
    const config = {
      "*": [
        {
          divId: "layerGroup0",
          orientation: this.state.orientation,
        },
      ],
    };
    this.state.dwvApp.setDataViewConfigs(config);
    // render data
    const dataIds = this.state.dwvApp.getDataIds();
    for (const dataId of dataIds) {
      this.state.dwvApp.render(dataId);
    }
  };

  /**
   * Handle a change draw shape event.
   * @param {string} shape The new shape name.
   */
  onChangeShape = (shape) => {
    if (this.state.dwvApp) {
      this.state.dwvApp.setToolFeatures({ shapeName: shape });
      this.setState({ selectedShape: shape });
    }
  };

  /**
   * Handle a reset event.
   */
  onReset = () => {
    if (this.state.dwvApp) {
      this.state.dwvApp.resetDisplay();
    }
  };

  /**
   * Open the DICOM tags dialog.
   */
  handleTagsDialogOpen = () => {
    this.setState({ showDicomTags: true });
  };

  /**
   * Close the DICOM tags dialog.
   */
  handleTagsDialogClose = () => {
    this.setState({ showDicomTags: false });
  };

  // drag and drop [begin] -----------------------------------------------------

  /**
   * Setup the data load drop box: add event listeners and set initial size.
   */
  setupDropbox = (app) => {
    this.showDropbox(app, true);
  };

  /**
   * Default drag event handling.
   * @param {DragEvent} event The event to handle.
   */
  defaultHandleDragEvent = (event) => {
    // prevent default handling
    event.stopPropagation();
    event.preventDefault();
  };

  /**
   * Handle a drag over.
   * @param {DragEvent} event The event to handle.
   */
  onBoxDragOver = (event) => {
    this.defaultHandleDragEvent(event);
    // update box border
    const box = document.getElementById(this.state.dropboxDivId);
    if (box && box.className.indexOf(this.state.hoverClassName) === -1) {
      box.className += " " + this.state.hoverClassName;
    }
  };

  /**
   * Handle a drag leave.
   * @param {DragEvent} event The event to handle.
   */
  onBoxDragLeave = (event) => {
    this.defaultHandleDragEvent(event);
    // update box class
    const box = document.getElementById(this.state.dropboxDivId);
    if (box && box.className.indexOf(this.state.hoverClassName) !== -1) {
      box.className = box.className.replace(
        " " + this.state.hoverClassName,
        ""
      );
    }
  };

  /**
   * Handle a drop event.
   * @param {DragEvent} event The event to handle.
   */
  onDrop = (event) => {
    this.defaultHandleDragEvent(event);
    // load files
    this.state.dwvApp.loadFiles(event.dataTransfer.files);
  };

  /**
   * Handle a an input[type:file] change event.
   * @param event The event to handle.
   */
  onInputFile = (event) => {
    if (event.target && event.target.files) {
      this.state.dwvApp.loadFiles(event.target.files);
    }
  };

  /**
   * Show/hide the data load drop box.
   * @param show True to show the drop box.
   */
  showDropbox = (app, show) => {
    const box = document.getElementById(this.state.dropboxDivId);
    if (!box) {
      return;
    }
    const layerDiv = document.getElementById("layerGroup0");

    if (show) {
      // reset css class
      box.className =
        this.state.dropboxClassName + " " + this.state.borderClassName;
      // check content
      if (box.innerHTML === "") {
        const p = document.createElement("p");
        p.appendChild(document.createTextNode("Drag and drop data here or "));
        // input file
        const input = document.createElement("input");
        input.onchange = this.onInputFile;
        input.type = "file";
        input.multiple = true;
        input.id = "input-file";
        input.style.display = "none";
        const label = document.createElement("label");
        label.htmlFor = "input-file";
        const link = document.createElement("a");
        link.appendChild(document.createTextNode("click here"));
        link.id = "input-file-link";
        label.appendChild(link);
        p.appendChild(input);
        p.appendChild(label);

        box.appendChild(p);
      }
      // show box
      box.setAttribute("style", "display:initial");
      // stop layer listening
      if (layerDiv) {
        layerDiv.removeEventListener("dragover", this.defaultHandleDragEvent);
        layerDiv.removeEventListener("dragleave", this.defaultHandleDragEvent);
        layerDiv.removeEventListener("drop", this.onDrop);
      }
      // listen to box events
      box.addEventListener("dragover", this.onBoxDragOver);
      box.addEventListener("dragleave", this.onBoxDragLeave);
      box.addEventListener("drop", this.onDrop);
    } else {
      // remove border css class
      box.className = this.state.dropboxClassName;
      // remove content
      box.innerHTML = "";
      // hide box
      box.setAttribute("style", "display:none");
      // stop box listening
      box.removeEventListener("dragover", this.onBoxDragOver);
      box.removeEventListener("dragleave", this.onBoxDragLeave);
      box.removeEventListener("drop", this.onDrop);
      // listen to layer events
      if (layerDiv) {
        layerDiv.addEventListener("dragover", this.defaultHandleDragEvent);
        layerDiv.addEventListener("dragleave", this.defaultHandleDragEvent);
        layerDiv.addEventListener("drop", this.onDrop);
      }
    }
  };

  // drag and drop [end] -------------------------------------------------------
} // DwvComponent

DwvComponent.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(DwvComponent);

export async function captureDivById(
  elementId,
  { format = "png", quality = 1, download = true } = {}
) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }

  try {
    let result;

    if (format === "jpeg") {
      result = await toJpeg(element, { quality });
    } else {
      result = await toPng(element);
    }

    if (download) {
      const link = document.createElement("a");
      link.download = `capture.${format}`;
      link.href = result;
      link.click();
    }

    return result;
  } catch (error) {
    console.error("Error capturing div:", error);
    throw error;
  }
}

/**
 * Capture as blob (for uploads)
 * @param {string} elementId - The ID of the div to capture
 * @returns {Promise<Blob>} Image blob
 */
export async function captureDivAsBlob(elementId) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }

  try {
    return await toBlob(element);
  } catch (error) {
    console.error("Error capturing div as blob:", error);
    throw error;
  }
}
