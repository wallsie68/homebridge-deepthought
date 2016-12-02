var Service, Characteristic;
var request = require("request");
var pollingtoevent = require('polling-to-event');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-deepthought", "Deepthought", DeepthoughtAccessory);
}

function DeepthoughtAccessory(log, config) {
    
    this.log = log;

    // accessory info
    this.on_url                 = config["on_url"];
    this.on_body                = config["on_body"];
    this.off_url                = config["off_url"];
    this.off_body               = config["off_body"];
    this.status_url             = config["status_url"];
    this.setlevel_url           = config["setlevel_url"];
    this.getlevel_url           = config["getlevel_url"];
    this.http_method            = config["http_method"]                     || "GET";;
    this.http_level_method      = config["http_brightness_method"]          || this.http_method;
    this.username               = config["username"]                        || "";
    this.password               = config["password"]                        || "";
    this.sendimmediately        = config["sendimmediately"]                 || "";
    this.service                = config["service"]                         || "Switch";
    this.name                   = config["name"];
    this.levelHandling          = config["levelHandling"]                   || "no";
    this.statusHandling         = config["statusHandling"]                  || "no";
		
    //realtime polling info
    this.state = false;
    this.currentlevel = 0;
    this.enableSet = true;
    var that = this;
		
    // Status Polling, if you want to add additional services that don't use switch handling you can add something like this || (this.service=="Smoke" || this.service=="Motion"))
    if (this.status_url && this.statusHandling =="realtime") {
        var statusurl = this.status_url;
        var statusemitter = pollingtoevent(function(done) {
            that.httpRequest(statusurl, "", "GET", that.username, that.password, that.sendimmediately, function(error, response, body) {
                if (error) {
                    that.log('HTTP poll status function failed: %s', error.message);
                    callback(error);
                } else {               				    
                    done(null, body);
                }
            })
        }, {longpolling:true,interval:300,longpollEventName:"statuspoll"});

        statusemitter.on("statuspoll", function(data) {       
            var binaryState = parseInt(data.replace(/\D/g,""));
            that.state = binaryState > 0;
            that.log(that.service, "polled status",that.status_url, "state is currently", binaryState); 
			
            // switch used to easily add additonal services
            that.enableSet = false;
            switch (that.service) {
                case "Switch":
                    if (that.switchService ) {
                        that.switchService .getCharacteristic(Characteristic.On)
                        .setValue(that.state);
                    }
                    break;
                case "Light":
                    if (that.lightbulbService) {
                        that.lightbulbService.getCharacteristic(Characteristic.On)
                        .setValue(that.state);
                    }		
                    break;			
                case "Temperature":
                    if (that.temperatureSensorService) {
                        that.temperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                        .setValue(that.state);
                    }		
                    break;			
            }
            that.enableSet = true;   
	});
    }

    // Brightness Polling
    if (this.getlevel_url && this.levelHandling =="realtime") {
        var brightnessurl = this.getlevel_url;
        var levelemitter = pollingtoevent(function(done) {
            that.httpRequest(brightnessurl, "", "GET", that.username, that.password, that.sendimmediately, function(error, response, responseBody) {
                if (error) {
                    that.log('HTTP poll level function failed: %s', error.message);
                    return;
                } else {               				    
                    done(null, responseBody);
                }
            }) // set longer polling as slider takes longer to set value
        }, {longpolling:true,interval:300,longpollEventName:"levelpoll"});

        levelemitter.on("levelpoll", function(data) {  
            that.currentlevel = parseInt(data);
            
            that.enableSet = false;
            
            if (that.lightbulbService) {				
                that.log(that.service, "polled brightness level", that.getlevel_url, "level is currently", that.currentlevel); 		        
                that.lightbulbService.getCharacteristic(Characteristic.Brightness)
                .setValue(that.currentlevel);
            }   
            if (that.temperatureSensorService) {				
            that.log(that.service, "polled temperature level", that.getlevel_url, "level is currently", that.currentlevel); 		        
                that.temperatureSensorService.getCharacteristic(Characteristic.CurrentTemperature)
                .setValue(that.currentlevel);
            }   
            that.enableSet = true;
        });    
    }
}


DeepthoughtAccessory.prototype = {

    httpRequest: function(url, body, method, username, password, sendimmediately, callback) {
        request({
            url: url,
            body: body,
            method: method,
            rejectUnauthorized: false,
            auth: {
                user: username,
                pass: password,
                sendImmediately: sendimmediately
               }
        },
        function(error, response, body) {
            callback(error, response, body)
        })
    },

    setPowerState: function(powerOn, callback) {
                                    
        if (this.enableSet == true && (this.currentlevel == 0 || !powerOn )) {
		
            var url;
            var body;
		
            if (!this.on_url || !this.off_url) {
                this.log.warn("Ignoring request; No on/off url defined.");
                callback(new Error("No on/off url defined."));
                return;
            }
		
            if (powerOn) {
                url = this.on_url;
                body = this.on_body;
                this.log("Setting state to on");
            } else {
                url = this.off_url;
                body = this.off_body;
                this.log("Setting state to off");
            }
		
            this.httpRequest(url, body, this.http_method, this.username, this.password, this.sendimmediately, function(error, response, responseBody) {
                if (error) {
                    this.log('HTTP set state function failed: %s', error.message);
                    callback(error);
                } else {
                    this.log('HTTP set state function succeeded!');
                    callback();
                }
            }.bind(this));
        } else {
            callback();
        }
    },
  
    getPowerState: function(callback) {
	if (!this.status_url) {
            this.log.warn("Ignoring request; No status url defined.");
            callback(new Error("No status url defined."));
            return;
        }
	
        var url = this.status_url;
        this.log("Getting state");
	
	this.httpRequest(url, "", "GET", this.username, this.password, this.sendimmediately, function(error, response, responseBody) {
            if (error) {
                this.log('HTTP get status function failed: %s', error.message);
                callback(error);
            } else {
                var binaryState = parseInt(responseBody.replace(/\D/g,""));
                var powerOn = binaryState > 0;
                this.log("Status is currently %s", binaryState);
                callback(null, powerOn);
            }
        }.bind(this));
    },

    getLevel: function(callback) {
        if (!this.getlevel_url) {
            this.log.warn("Ignoring request; No level url defined.");
            callback(new Error("No level url defined."));
            return;
        }		
        var url = this.getlevel_url;
        this.log("Getting level");
	
        this.httpRequest(url, "", "GET", this.username, this.password, this.sendimmediately, function(error, response, responseBody) {
            if (error) {
                this.log('HTTP get level function failed: %s', error.message);
                callback(error);
            } else {			
              var level = parseInt(data);
              this.log("level state is currently ", level);
              callback(null, level);
            }
        }.bind(this));
    },

    setLevel: function(level, callback) {
        if (this.enableSet == true) {
            if (!this.setlevel_url) {
                this.log.warn("Ignoring request; No level url defined.");
                callback(new Error("No level url defined."));
                return;
            }    
	
            var url = this.setlevel_url.replace("%b", level)
	
            this.log("Setting level to %s", level);
	
            this.httpRequest(url, "", this.http_level_method, this.username, this.password, this.sendimmediately, function(error, response, body) {
                if (error) {
                    this.log('HTTP level function failed: %s', error);
                    callback(error);
                } else {
                    this.log('HTTP level function succeeded!');
                    callback();
                }
            }.bind(this));
        } else {
            callback();
        }
    },

    identify: function(callback) {
        this.log("Identify requested!");
        callback(); // success
    },

    getServices: function() {
		
        var that = this;
		
        // you can OPTIONALLY create an information service if you wish to override
        // the default values for things like serial number, model, etc.
        var informationService = new Service.AccessoryInformation();
	
        informationService
        .setCharacteristic(Characteristic.Manufacturer, "The Walls Family")
	
        switch (this.service) {
            case "Switch": 
                informationService
                    .setCharacteristic(Characteristic.Model, "Switch")
                    .setCharacteristic(Characteristic.SerialNumber, "WALLS00002");
                this.switchService = new Service.Switch(this.name);
                switch (this.statusHandling) {	
                    //Status Polling			
                    case "yes":					
                        this.switchService
                        .getCharacteristic(Characteristic.On)
                        .on('get', this.getPowerState.bind(this))
                        .on('set', this.setPowerState.bind(this));						
                        break;
                    case "realtime":				
                        this.switchService
                        .getCharacteristic(Characteristic.On)
                        .on('get', function(callback) {callback(null, that.state)})
                        .on('set', this.setPowerState.bind(this));
                        break;
                    default	:	
                        this.switchService
                        .getCharacteristic(Characteristic.On)	
                        .on('set', this.setPowerState.bind(this));					
                        break;
                }
                return [this.switchService];
            case "Light":	
                informationService
                    .setCharacteristic(Characteristic.Model, "Lamp")
                    .setCharacteristic(Characteristic.SerialNumber, "WALLS00003");
                this.lightbulbService = new Service.Lightbulb(this.name);			
                switch (this.statusHandling) {
                    //Status Polling
                    case "yes" :
                        this.lightbulbService
                        .getCharacteristic(Characteristic.On)
                        .on('get', this.getPowerState.bind(this))
                        .on('set', this.setPowerState.bind(this));
                        break;
                    case "realtime":
                        this.lightbulbService
                        .getCharacteristic(Characteristic.On)
                        .on('get', function(callback) {callback(null, that.state)})
                        .on('set', this.setPowerState.bind(this));
                        break;
                    default:		
                        this.lightbulbService
                        .getCharacteristic(Characteristic.On)	
                        .on('set', this.setPowerState.bind(this));
                        break;
                }
                    
                // Level Polling 
                if (this.levelHandling == "realtime") {
                    this.lightbulbService 
                    .addCharacteristic(new Characteristic.Brightness())
                    .on('get', function(callback) {callback(null, that.currentlevel)})
                    .on('set', this.setLevel.bind(this));
                } else if (this.levelHandling == "yes") {
                    this.lightbulbService
                    .addCharacteristic(new Characteristic.Brightness())
                    .on('get', this.getLevel.bind(this))
                    .on('set', this.setLevel.bind(this));							
                }
	
                return [informationService, this.lightbulbService];
                break;		
                
            case "Temperature":	
                informationService
                    .setCharacteristic(Characteristic.Model, "Temperature")
                    .setCharacteristic(Characteristic.SerialNumber, "WALLS00004");
                this.temperatureSensorService = new Service.TemperatureSensor(this.name);			
                    
                // Level Polling 
                if (this.levelHandling == "realtime") {
                    this.temperatureSensorService 
                    .getCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', function(callback) {callback(null, that.currentlevel)})
                    .setProps({
                        minValue: -100,
                        maxValue: 100
                    });
                } else if (this.levelHandling == "yes") {
                    this.temperatureSensorService
                    .getCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', this.getLevel.bind(this))
                }
	
                return [informationService, this.temperatureSensorService];
                break;		
        }
    }
};
