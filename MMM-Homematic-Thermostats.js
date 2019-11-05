Module.register("MMM-Homematic-Thermostats", {

	// Default module config.
	defaults: {
		devices: [],
		ccu2IP: "homematic-ccu2",
		xmlapiURL: "config/xmlapi",
		updateInterval: 300000,  // 5min
		warnColor: "red",
		showSetTemperature: false,
		showFaultReporting: false,
		showCurrentMode: false,
		showHumidity: false,
		precisionTemp: 2,
		precisionHum: 0,
		warnTempHigh: false,
		warnTempLow: false,
		warnHumHigh: false,
		warnHumLow: false,
		tempThresholdHigh: 24,
		tempThresholdLow: 5,
		humThresholdHigh: 60,
		humThresholdLow: 35,
	},

	homematicUrl: "",
	moduleDisplay: "",
	configurationSettings: [],

	// Override dom generator.
	getDom: function () {
		var wrapper = document.createElement("div");
		wrapper.innerHTML = this.moduleDisplay;
		return wrapper;
	},

	// Define start sequence.
	start: function () {
		var self = this;
		self.homematicUrl = this.config.ccu2IP + "/" + this.config.xmlapiURL;
		self.configurationSettings = self.readConfiguration(this.config);
		setInterval(function () {
			self.getDataFromCCU2();
			self.updateDom();
		}, this.config.updateInterval);
		moment.locale(this.config.language);
		self.getDataFromCCU2();
		Log.info("Starting module: " + this.name + " accessing URL " + self.homematicUrl);
	},

	/**
	 * Send the notification request to the node_helper to get
	 * all settings of all requested devices
	 */
	getDataFromCCU2: function () {
		var self = this;
		this.sendSocketNotification(
			"MMM_CCU2_REQUEST",
			{
				deviceList: self.createPayloadForRequest(),
				url: self.homematicUrl,
			}
		);
	},

	/**
	 * Prepare the settings specified in the config.js
	 * and do some basic checks to prevent common errors
	 */
	readConfiguration: function (config) {
		var deviceSettings = {};

		config.devices.forEach(device => {
			let settings = {
				configDeviceId: device.id,
				configDeviceLabel: device.label || ""
			};

			// RT & WT
			settings["configDeviceShowSetTemperature"] = !!device.showSetTemperature ? device.showSetTemperature : config.showSetTemperature;
			settings["configDeviceShowFaultReport"] = !!device.showFaultReporting ? device.showFaultReporting : config.showFaultReporting;
			settings["configDeviceShowCurrentMode"] = !!device.showCurrentMode ? device.showCurrentMode : config.showCurrentMode;
			settings["configDevicePrecisionTemp"] = !!device.precisionTemp ? device.precisionTemp : config.precisionTemp;
			settings["configDeviceWarnTempHigh"] = !!device.warnTempHigh ? device.warnTempHigh : config.warnTempHigh;
			settings["configDeviceWarnTempLow"] = !!device.warnTempLow ? device.warnTempLow : config.warnTempLow;
			settings["configDeviceTempThresholdHigh"] = !!device.tempThresholdHigh ? device.tempThresholdHigh : config.tempThresholdHigh;
			settings["configDeviceTempThresholdLow"] = !!device.tempThresholdLow ? device.tempThresholdLow : config.tempThresholdLow;

			// WT
			settings["configDeviceShowHumidity"] = !!device.showHumidity ? device.showHumidity : config.showHumidity;
			settings["configDevicePrecisionHum"] = !!device.precisionHum ? device.precisionHum : config.precisionHum;
			settings["configDeviceWarnHumHigh"] = !!device.warnHumHigh ? device.warnHumHigh : config.warnHumHigh;
			settings["configDeviceWarnHumLow"] = !!device.warnHumLow ? device.warnHumLow : config.warnHumLow;
			settings["configDeviceHumThresholdHigh"] = !!device.humThresholdHigh ? device.humThresholdHigh : config.humThresholdHigh;
			settings["configDeviceHumThresholdLow"] = !!device.humThresholdLow ? device.humThresholdLow : config.humThresholdLow;

			deviceSettings[device.id] = settings;
		});

		deviceSettings["global"] = {
			configColumnActTemp: true,
			configColumnSetTemp: config.devices.some(device => !!device.showSetTemperature) || config.showSetTemperature,
			configColumnHumidity: false,
			configColumnMode: config.devices.some(device => !!device.showCurrentMode) || config.showCurrentMode,
		}

		return deviceSettings;
	},

	/**
	 * Creates the payload for the socket notification
	 */
	createPayloadForRequest: function () {
		var payload = [];
		this.config.devices.forEach(device => {
			payload.push(JSON.stringify({ "deviceId": device.id }));
		})
		return payload;
	},

	/**
	 * Receives the notification with the response from the node_helper
	 */
	socketNotificationReceived: function (notification, payload) {
		if (notification === "MMM_CCU2_RESPONSE") {
			if (payload && payload.content) {
				this.moduleDisplay = this.prepareOutputForDevices(payload.content);
				this.updateDom();
			}
		}
	},

	/**
	 * Prepares the output for displaying the values in the mirror.
	 */
	prepareOutputForDevices: function (response) {
		let htmlOutput = "";

		response.forEach(deviceData => {
			for (let deviceId in deviceData) {
				const device = deviceData[deviceId][0]
				const deviceType = !!device["VALVE_STATE"] ? 'RT' : 'WT';

				const configDeviceLabel = this.configurationSettings[deviceId]["configDeviceLabel"]
				const deviceLabel = configDeviceLabel !== "" ? configDeviceLabel : device.deviceName
				const actualTemperature = device["ACTUAL_TEMPERATURE"]["value"];
				const actualTemperatureStr = this.prepareAttribute("ACTUAL_TEMPERATURE", device, this.configurationSettings[deviceId]["configDevicePrecisionTemp"]);
				const setTemperature = this.prepareAttribute("SET_TEMPERATURE", device, this.configurationSettings[deviceId]["configDevicePrecisionTemp"]);
				const currentMode = this.prepareControlModeOutput(device);
				const actualHumidity = deviceType === 'WT' ? device["ACTUAL_HUMIDITY"]["value"] : undefined;
				const actualHumidityStr = deviceType === 'WT' ? this.prepareAttribute("ACTUAL_HUMIDITY", device, this.configurationSettings[deviceId]["configDevicePrecisionHum"]) : undefined;
				const faultMode = this.prepareFaultReporting(device["FAULT_REPORTING"]);

				let classNameStr = ""
				let htmlDeviceEntry = "<span class='deviceContainer'>";

				// Label
				htmlDeviceEntry += "<span class='deviceLabel'>" + deviceLabel + ":&nbsp;</span>"

				// Actual Temp
				classNameStr = "deviceActualTemperature";
				if ((this.configurationSettings[deviceId]["configDeviceWarnTempLow"] && actualTemperature <= this.configurationSettings[deviceId]["configDeviceTempThresholdLow"]) ||
					(this.configurationSettings[deviceId]["configDeviceWarnTempHigh"] && actualTemperature >= this.configurationSettings[deviceId]["configDeviceTempThresholdHigh"])) {
					classNameStr = classNameStr + " bright " + this.config.warnColor;
				}
				htmlDeviceEntry += "<span class='" + classNameStr + "'>" + actualTemperatureStr + "</span>";

				// Set Temp
				if (this.configurationSettings[deviceId]["configDeviceShowSetTemperature"]) {
					htmlDeviceEntry += "<span class='deviceLabel'>&nbsp;/&nbsp;</span><span class='deviceSetTemperature'>" + setTemperature + "</span>"
				}

				// Hum
				if (this.configurationSettings[deviceId]["configDeviceShowHumidity"] && deviceType == "WT") {
					classNameStr = "";
					if ((this.configurationSettings[deviceId]["configDeviceWarnHumLow"] && actualHumidity <= this.configurationSettings[deviceId]["configDeviceHumThresholdLow"]) ||
						(this.configurationSettings[deviceId]["configDeviceWarnHumHigh"] && actualHumidity >= this.configurationSettings[deviceId]["configDeviceHumThresholdHigh"])) {
						classNameStr = " class='bright " + this.config.warnColor + "'";
					}
					htmlDeviceEntry += "<span class='deviceHumidity'>&nbsp;(" + this.translate("UNIT_HUM") + ":&nbsp;" + "<span" + classNameStr + ">" + actualHumidityStr + "</span>)&nbsp;</span>";
				}

				// Mode
				if (this.configurationSettings[deviceId]["configDeviceShowCurrentMode"]) {
					htmlDeviceEntry += "<span class='deviceMode'>&nbsp;(" + currentMode + ")</span>";
				}

				htmlDeviceEntry += "</span>";

				// Show Fault
				if (this.configurationSettings[deviceId]["configDeviceShowFaultReport"]) {
					htmlDeviceEntry += faultMode
				}

				htmlOutput += htmlDeviceEntry;

			}
		})
		return htmlOutput;
	},

	/**
	 * Prepare the output of the given attribute. Reads the attributeName from the
	 * settingsArray and do further processing on it, i.e. to display the value with the
	 * unit (temperature, valve state) or anything else.
	 * Can be used in the future to prepare any other attributes for output.
	 */
	prepareAttribute: function (attributeName, settingsArray, precision) {
		var preparedAttributeValue = "";
		var attributeNameArray = settingsArray[attributeName];
		switch (attributeName) {
			//As of now, all attributes below can be handled with the same logic
			case "ACTUAL_TEMPERATURE":
			case "SET_TEMPERATURE":
			case "VALVE_STATE":
			case "ACTUAL_HUMIDITY":
				preparedAttributeValue = Number(parseFloat(attributeNameArray["value"])).toLocaleString(this.config.localeStr, { minimumFractionDigits: precision, maximumFractionDigits: precision }) + attributeNameArray["valueunit"];
				break;
		}
		return preparedAttributeValue;
	},

	/**
	 * Prepare the control mode of the radiator specified in CONTROL_MODE
	 * parameter. Translate the returning number according to the Homematic
	 * documentation into the available values.
	 */
	prepareControlModeOutput: function (settingsArray) {
		var controlMode = Number(settingsArray["CONTROL_MODE"]["value"]);
		// @spitzlbergerj, 20190210: wall thermostat doesn't contain element VALVE_STATE
		if (settingsArray["VALVE_STATE"]) {
			// @spitzlbergerj, 20190210: Array with element VALVE_STATE, should be radiator thermostat
			var valveState = Number(settingsArray["VALVE_STATE"]["value"]);
			var valveStateDisplay = valveState + settingsArray["VALVE_STATE"]["valueunit"];
		} else {
			var valveState = -1;
			var valveStateDisplay = "-";
		}
		var translatedMode = this.translate("RADIATOR_OFF");
		var modus = "AUTO"; //default
		switch (controlMode) {
			case 0:
				modus = "AUTO";
				if (valveState > 0) {
					//Do not show word "auto" in auto mode: this.translate("RADIATOR_MODE_".concat(modus))
					translatedMode = this.translate("HEATS_WITH") + " " + valveStateDisplay;
				} else if (valveState < 0) {
					//it's a wall thermostat
					translatedMode = this.translate("RADIATOR_MODE") + " " + this.translate("RADIATOR_MODE_".concat(modus));
				}
				break;
			case 1:
				modus = "MANUAL";
				if (valveState !== 0) {
					translatedMode = this.translate("RADIATOR_MODE_".concat(modus)) + ", " + this.translate("HEATS_WITH") + " " + valveStateDisplay;
				} else if (valveState < 0) {
					//it's a wall thermostat
					translatedMode = this.translate("RADIATOR_MODE") + " " + this.translate("RADIATOR_MODE_".concat(modus));
				}
				break;
			case 2:
				modus = "PARTY"; //Urlaubsmodus
				var urlaubsEnde = moment().set({
					"year": settingsArray["PARTY_STOP_YEAR"]["value"],
					"month": (settingsArray["PARTY_STOP_MONTH"]["value"] - 1),
					"date": settingsArray["PARTY_STOP_DAY"]["value"]
				});
				translatedMode = this.translate("RADIATOR_MODE_".concat(modus)) + " " + this.translate("HOLIDAY_MODE_UNTIL") + " ";
				translatedMode = translatedMode + urlaubsEnde.format("ddd, MMM Do Y");
				break;
			case 3:
				modus = "BOOST";
				translatedMode = this.translate("RADIATOR_MODE_".concat(modus));
		}//switch
		return translatedMode;
	},

	/**
	 * Translate the values of parameter CONTROL_MODE to their
	 * human readable values that can be used for i18n afterwards
	 * According Homematic documentation for datapoints
	 */
	prepareControlMode: function (controlModeParameter) {
		var controlMode = Number(controlModeParameter["value"]);
		var modus = "AUTO"; //default
		switch (controlMode) {
			case 0:
				modus = "AUTO";
				break;
			case 1:
				modus = "MANUAL";
				break;
			case 2:
				modus = "PARTY"; //Urlaubsmodus
				break;
			case 3:
				modus = "BOOST";
		}//switch
		return modus;
	},

	/**
	 * Prepare the error (if any) for the FAULT_REPORTING parameter.
	 * Translate the states into their values (according Homematic documentation)
	 * to be able to use it in the translation files. Return an empty
	 * string if everything is fine.
	 */
	prepareFaultReporting: function (faultReporting) {
		let errorMsg = "";
		// @spitzlbergerj, 20190210: wall thermostat doesn't contain element FAULT_REPORTING
		if (!!faultReporting) {
			// @spitzlbergerj, 20190210: Array with element FAULT-REPORTING, should be radiator thermostat
			const faultCode = Number(faultReporting["value"]);
			switch (faultCode) {
				case 1:
					errorMsg = this.translate("VALVE_TIGHT");
					break;
				case 2:
					errorMsg = this.translate("ADJUSTING_RANGE_TOO_LARGE");
					break;
				case 3:
					errorMsg = this.translate("ADJUSTING_RANGE_TOO_SMALL");
					break;
				case 4:
					errorMsg = this.translate("COMMUNICATION_ERROR");
					break;
				case 6:
					errorMsg = this.translate("LOWBAT");
					break;
				case 7:
					errorMsg = this.translate("VALVE_ERROR_POSITION");
					break;
			}
		}

		if (errorMsg !== "") {
			return "<span class='faultReporting'>" + this.translate("WARNING") + errorMsg + "</span>";
		}
		return "";
	},

	// Define required style-sheet scripts
	getStyles: function () {
		return ["MMM-Homematic-Thermostats.css"];
	},

	// Define required dependency scripts
	getScripts: function () {
		return ["moment.js"];
	},

	// Define required translation files
	getTranslations: function () {
		return {
			en: "translations/en.json",
			de: "translations/de.json"
		};
	}
});
