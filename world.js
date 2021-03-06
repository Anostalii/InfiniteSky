// This file is part of InfiniteSky.
// Copyright (c) InfiniteSky Dev Teams - Licensed under GNU GPL
// For more information, see LICENCE in the main folder
vms.depends({
    name: 'World Server',
    depends: [
    'Info_Exp',
    'Info_Item',
    'Info_Npc',
    'Info_Skill',
    'Zone',
    'Packets',
    'Character',
    'Account',
    'CVec3'
    ]
    // depends: ['infos.Exp.Loaded', 'infos.Item.Loaded', 'infos.Npc.Loaded', 'infos.Skill.Loaded', 'db.Account', 'db.Character', 'Zone', 'packets']
}, function() {
    if(typeof(world) === 'undefined') {
        console.log('World server code loaded');
        world = {
            packets: new PacketCollection('./packets/world', 'WorldPC', require('./sandbox')),
            start: function() {
                this.server = net.createServer(function(socket) {
                    world.connection(socket);
                });
                console.log('World server starting listen on port: ' + config.ports.world);
                this.server.listen(config.ports.world);

                this.loadAllZones();
                world.prepareGuilds();

                main.events.emit('world_started');
                main.events.on('step', function(delta) {
                    world.GameStep(delta);
                });

                main.events.on('step', this.step);
            },
            running: true
        };
        // Need to move to world.js
        world.clients = [];
        world.clientID = 0;
        world.socket_transfers = [];
    } else {
        console.log('World server code reloaded');
    }
    // zones is an object which will contain references to each zone object by its id.
    if(typeof(zones) === 'undefined') {
        zones = {};
    }    
    world.GameStep = function(delta) {
        // Do something with delta
        // console.log('Delta: '+delta);
    };
    world.connection = function(socket) {
        console.log("Client #" + world.clientID + " connected from IP " + socket.remoteAddress);
        socket.clientID = world.clientID;
        world.clientID++;
        socket.authenticated = false;
        // Start of Socket Functions
        socket.Destroying = false;
        socket.clientID = world.clientID;
        world.clientID++;
        // TODO: World server should assume the previous socket's id after a successfull handshake/login.
        // This allows us to have a session object using that id :)
        socket.authenticated = false;
        socket.character = {};
        socket.zoneTransfer = false;
        socket.zoneForceTransfer = false;
        // Setup commands for socket here
        socket.character.do2FPacket = 0;
        // Character related commands
        socket.toString = function(Format) {
            return this.world.clientID + ' - ' + this.account.Username + ' Char: ' + this.character.Name + ' Map: ' + this.character.MapID + ' CharacterID: ' + this.character._id;
            //CharacterTypeIdentifier
        };
        // Gives the character exp and handles sending out the level up packets
        socket.giveEXP = function(value) {
            if(value <= 0) return; // If no exp given or - amount

            var expinfo = infos.Exp[this.character.Level];
            if (expinfo==null || infos.Exp[145].EXPEnd === this.character.Experience) return;

            this.character.Experience += value;
            if(this.character.Experience > infos.Exp[145].EXPEnd) this.character.Experience = infos.Exp[145].EXPEnd;

            var reminder = expinfo.EXPEnd - this.character.Experience;
            var levelGained = 0;

            while(reminder < 0){
                levelGained++;

                expinfo = infos.Exp[this.character.Level + levelGained];
                if(!expinfo) break;

                this.character.Experience += 1;
                this.character.SkillPoints += expinfo.SkillPoint;
                this.character.StatPoints += (this.character.Level + levelGained) > 99 && (this.character.Level + levelGained) <= 112 ? 0 : (this.character.Level + levelGained) > 112 ? 30 : 5;
                reminder = (expinfo.EXPEnd - expinfo.EXPStart) + reminder;
            }


            this.send2FUpdate();

            if((this.character.Level + levelGained) > 145 || this.character.Experience > infos.Exp[145].EXPEnd){
                levelGained = 145 - this.character.Level;
                this.character.Experience = infos.Exp[145].EXPEnd;
                this.character.Level = 145;
            }else{
                this.character.Level += levelGained;
            }

            console.log(this.character.Name + "' gained "+value+" experience");

            if(levelGained > 0){
                this.character.infos.updateAll();
                this.character.state.CurrentHP = this.character.infos.MaxHP;
                this.character.state.CurrentChi = this.character.infos.MaxChi;
                this.character.Health = this.character.infos.MaxHP;
                this.character.Chi = this.character.infos.MaxChi;

                this.character.state.Level = this.character.Level;

                this.Zone.sendToAllArea(this, true, new Buffer(packets.LevelUpPacket.pack({
                    PacketID: 0x2E,
                    LevelsGained: levelGained,
                    CharacterID: this.character._id,
                    NodeID: this.node.id
                })), config.viewable_action_distance);
            }

            this.character.save();
        };

        socket.giveItemInStorage = function(item, action) {
            console.log('giveItemInInventory not yet implemented');
            var ItemID = item.ItemID || 0;
            var Column = item.Column || 0;
            var Row = item.Row || 0;
            var Amount = item.Amount || 0;
            var Enchant = item.Enchant || 0;
            var Combine = item.Combine || 0;
            var Action = action || 1; // Default action for giving item using gm command
            if(item.Column === null && item.Row === null) {
                // Find best Column/Row
            }
            // do magic here item could be an id defaulting amount of 1 or an object like new_character_json has
            if(this.character.QuickUseItems[item.RowPickup] === null) {
                this.character.QuickUseItems[item.RowPickup] = {
                    "Amount": item.Amount,
                    "ID": item.ItemID
                };
                this.character.markModified('QuickUseItems');
                this.character.save();
                console.log("Amount" + item.Amount + "ID" + item.itemID);
                return 15;
            } else if(this.character.QuickUseItems[item.RowPickup] !== null && ItemID === this.character.QuickUseItems[item.RowPickup].ID) {
                this.character.QuickUseItems[item.RowPickup] = {
                    "Amount": item.Amount + this.character.QuickUseItems[item.RowPickup.Amount]
                };
                this.character.markModified('QuickUseItems');
                this.character.save();
                console.log("Amount" + item.Amount + "ID" + item.itemID);
                return 15;
            } else {
                //whatever is thier goes back in inventory
                this.LogoutUser;
            }
            return -15;
            // Update char info
            // Save inventory data
        }
        socket.giveItemInInventory = function(item, action) {
            console.log('giveItemInInventory not yet implemented');
            var ItemID = item.ItemID || 0;
            var Column = item.Column || 0;
            var Row = item.Row || 0;
            var Amount = item.Amount || 0;
            var Enchant = item.Enchant || 0;
            var Combine = item.Combine || 0;
            var Action = action || 1; // Default action for giving item using gm command
            if(item.Column == null && item.Row == null) {
                // Find best Column/Row
            }
            // do magic here item could be an id defaulting amount of 1 or an object like new_character_json has
            for(var i = 0; i < 64; ++i) {
                if(this.character.Inventory[i] == null) {
                    this.character.Inventory[i] = {
                        "Amount": item.Amount,
                        "Column": item.ColumnMove,
                        "Row": item.RowMove,
                        "ID": item.ItemID
                    }
                    this.character.markModified('Inventory');
                    this.character.save();
                    console.log("Amount" + item.Amount + "Column" + item.ColumnMove + "Row" + item.RowMove + "ID" + item.itemID)
                    return 15;
                } else {
                    this.LogoutUser;
                }
            }
            return -15;
            // Update char info
            // Save inventory data
        }
        socket.giveSkillInSkillBar = function(item, action) {
            console.log('giveSkillInSkillBar not yet implemented');
            var Skill = this.character.SkillList[item.InventoryIndex]
            var ItemID = Skill.ID || 0;
            var Column = item.Level || 0;
            var Row = item.Row || 0;
            var Amount = item.Amount || 0;
            var Enchant = item.Enchant || 0;
            var Combine = item.Combine || 0;
            var Action = action || 1; // Default action for giving item using gm command
            if(item.RowPickup == null && item.ColumnPickup == null) {
                // Find best Column/Row
            }
            // do magic here item could be an id defaulting amount of 1 or an object like new_character_json has
            if(this.character.SkillBar[item.RowPickup] == null) {
                this.character.SkillBar[item.RowPickup] = {
                    "ID": Skill.ID,
                    "Level": item.Amount
                }
                this.character.markModified('SkillBar');
                this.character.save();
                console.log("ID" + Skill.ID + "Level" + item.Amount + "||");
                return 15;
            } else if(this.character.QuickUseItems[item.RowPickup] != null) {
                this.character.SkillBar[item.RowPickup] = {
                    "ID": Skill.ID,
                    "Level": item.Amount
                }
                this.character.markModified('SkillBar');
                this.character.save();
                console.log("ID" + Skill.ID + "Level" + item.Amount + "||OVERRIGHT");
                return 15;
            } else {
                //whatever is thier goes back in inventory
                this.LogoutUser;
            }
            return -15;
            // Update char info
            // Save inventory data
        }
        socket.giveItemInPillBar = function(item, action) {
            console.log('giveItemInInventory not yet implemented');
            var ItemID = item.ItemID || 0;
            var Column = item.Column || 0;
            var Row = item.Row || 0;
            var Amount = item.Amount || 0;
            var Enchant = item.Enchant || 0;
            var Combine = item.Combine || 0;
            var Action = action || 1; // Default action for giving item using gm command
            if(item.Column == null && item.Row == null) {
                // Find best Column/Row
            }
            // do magic here item could be an id defaulting amount of 1 or an object like new_character_json has
            if(this.character.QuickUseItems[item.RowPickup] == null) {
                this.character.QuickUseItems[item.RowPickup] = {
                    "Amount": item.Amount,
                    "ID": item.ItemID
                }
                this.character.markModified('QuickUseItems');
                this.character.save();
                console.log("Amount" + item.Amount + "ID" + item.itemID);
                return 15;
            } else if(this.character.QuickUseItems[item.RowPickup] != null && ItemID == this.character.QuickUseItems[item.RowPickup].ID) {
                this.character.QuickUseItems[item.RowPickup] = {
                    "Amount": item.Amount + this.character.QuickUseItems[item.RowPickup.Amount]
                }
                this.character.markModified('QuickUseItems');
                this.character.save();
                console.log("Amount" + item.Amount + "ID" + item.itemID);
                return 15;
            } else {
                //whatever is thier goes back in inventory
                this.LogoutUser;
            }
            return -15;
            // Update char info
            // Save inventory data
        }
        socket.giveItemInPillBar = function(item, action) {
            console.log('giveItemInInventory not yet implemented');
            var ItemID = item.ItemID || 0;
            var Column = item.Column || 0;
            var Row = item.Row || 0;
            var Amount = item.Amount || 0;
            var Enchant = item.Enchant || 0;
            var Combine = item.Combine || 0;
            var Action = action || 1; // Default action for giving item using gm command
            if(item.Column == null && item.Row == null) {
                // Find best Column/Row
            }
            // do magic here item could be an id defaulting amount of 1 or an object like new_character_json has
            if(this.character.QuickUseItems[item.RowPickup] == null) {
                this.character.QuickUseItems[item.RowPickup] = {
                    "Amount": item.Amount,
                    "ID": item.ItemID
                }
                this.character.markModified('QuickUseItems');
                this.character.save();
                console.log("Amount" + item.Amount + "ID" + item.itemID);
                return 15;
            } else if(this.character.QuickUseItems[item.RowPickup] != null && ItemID == this.character.QuickUseItems[item.RowPickup].ID) {
                this.character.QuickUseItems[item.RowPickup] = {
                    "Amount": item.Amount + this.character.QuickUseItems[item.RowPickup.Amount]
                }
                this.character.markModified('QuickUseItems');
                this.character.save();
                console.log("Amount" + item.Amount + "ID" + item.itemID);
                return 15;
            } else {
                //whatever is thier goes back in inventory
                this.LogoutUser;
            }
            return -15;
            // Update char info
            // Save inventory data
        }
        socket.send2FUpdate = function() {
            // console.log(this.character.Level);
            var update = {
                'PacketID': 0x2F,
                'Level': this.character.Level,
                'Experience': this.character.Experience,
                'Honor': this.character.Honor,
                'CurrentHP': this.character.state.CurrentHP,
                'CurrentChi': this.character.state.CurrentChi,
                'PetActivity': this.character.Pet === null ? 0 : this.character.Pet.Activity,
                'PetGrowth': this.character.Pet === null ? 0 : this.character.Pet.Growth
            };
            this.write(new Buffer(packets.HealingReplyPacket.pack(update)));
        }
        // Returns false if it failed, true if success
        socket.Teleport = function(Location, ZoneID) {
            var ChangeZone = false;
            // Teleport to zone
            // Make sure ZoneID is number.
            if(ZoneID && ZoneID != this.character.MapID) {
                var thePort = 0;
                var theIP = '';
                var status = 0;
                console.log("Teleporting to Zone ID's not tested yet");
                // Check if zone id exists
                var TransferZone = worldserver.findZoneByID(ZoneID);
                if(TransferZone == null) {
                    console.log("Zone not found");
                    status = 1;
                    this.write(
                    new Buffer(
                    packets.MapLoadReply.pack({
                        packetID: 0x0A,
                        Status: status,
                        IP: theIP,
                        Port: thePort
                    })));
                    return false;
                }
                console.log('Zone found');
                if(Location) {
                    // Use the location
                    console.log('Location set');
                    this.character.state.Location.X = Location.X;
                    this.character.state.Location.Y = Location.Y;
                    this.character.state.Location.Z = Location.Z;
                    this.character.state.Skill = 0;
                    this.character.state.Frame = 0;
                    this.sendActionStateToArea();
                } else {
                    // Get a location for the zone
                    console.log('Finding portal 0 endpoint');
                    var PortalEndPoint = TransferZone.getPortalEndPoint(0);
                    if(PortalEndPoint) {
                        console.log('Location set');
                        this.character.state.Location.X = PortalEndPoint.X;
                        this.character.state.Location.Y = PortalEndPoint.Y;
                        this.character.state.Location.Z = PortalEndPoint.Z;
                        // Get random spot in that radius?
                    } else {
                        console.log('Location not set');
                        this.character.state.Location.X = 0;
                        this.character.state.Location.Y = 0;
                        this.character.state.Location.Z = 0;
                    }
                }
                // The Character State object for use in world for moving and health etc.
                //this.character.state.setFromCharacter(this.character);
                //console.log(this.character.state.Location);
                // Ask the zones/mapservers if they are ready for connections
                // If not then set Status to 1
                //status = 1;
                // Add to WorldServer client transfer.
                // Set the ZoneID and XYZ they are to goto.
                this.character.MapID = TransferZone.getID();
                this.zoneTransfer = true;
                this.zoneForceTransfer = true;
                worldserver.addSocketToTransferQueue(this);
                console.log('Tell client which map server to connect too');
                //socket.characters[gamestart.Slot].MapID << get the map id of character :P
                // Get world.clients ip, check if it is on lan with server,
                // if so send it servers lan ip and port
                // otherwise send it real world ip and port
                theIP = config.externalIP;
                if(this.remoteAddress.indexOf('127') == 0) {
                    theIP = '127.0.0.1'
                }
                console.log('IP for client to connect too before translation: ' + theIP);
                for(var i = 0; i < natTranslations.length; i++) {
                    if(natTranslations[i].contains(this.remoteAddress)) {
                        theIP = natTranslations[i].ip;
                        break;
                    }
                }
                console.log('IP for client to connect too: ' + theIP);
                thePort = config.ports.world;
                console.log({
                    packetID: 0x0A,
                    Status: status,
                    IP: theIP,
                    Port: thePort
                });
                this.account.save();
                this.character.save();
                this.write(
                new Buffer(
                packets.MapLoadReply.pack({
                    packetID: 0x0A,
                    Status: status,
                    IP: theIP,
                    Port: thePort
                })));
                return true;
            }
            if(Location) {
                this.character.state.Location.X = Location.X;
                this.character.state.Location.Y = Location.Y;
                this.character.state.Location.Z = Location.Z;
            }
            // Send character update packet
            this.Zone.sendToAllArea(this, true, packets.makeCompressedPacket(
            0x18, new Buffer(
            WorldPC.ActionReplyPacket.pack(
            this.character.state))), config.viewable_action_distance);
            return true;
        }
        socket.onDeath = function(Killer) {
            if(Killer) {
                // Killed by player, monster, npc?
                switch(typeof(Killer.constructor.name)) {
                case "Monster":
                    break;
                case "NPC":
                    break;
                case "Socket":
                    // Handle giving the other character bonuses etc
                    console.log(this.toString() + ' Killed By ' + Killer.toString());
                    break;
                case "World":
                    break;
                }
            } else {
                console.log(this.toString() + ' Killed');
            }
        }
        // End of commands
        socket.LogoutUser = function() {
            if(socket.authenticated) {
                if(socket.zoneTransfer == false) {
                    //Save Character to DB
                    socket.character.save();
                    socket.account.active = 0;
                    socket.account.save();
                    // db.mongoose.Account.update({
                    //  _id: socket.account._id
                    // }, {
                    //  $set: {
                    //      active: "0"
                    //  }
                    // });
                }
            }
            if(typeof(socket.Zone) != 'undefined') {
                console.log('LogoutUser remove socket');
                socket.Zone.removeSocket(socket);
            }
            console.log('socket.LogoutUser ' + socket.Username);
            world.getSocketFromTransferQueue(this.account.Username);
        }


        socket.on('error', function(err) {
            console.log('Client #' + socket.clientID + ' error: ', err);
            socket.destroy();
            //removeDisconnectedCharacter.call(socket);
        });
        //Handle socket disconnection
        // socket.on('end', function() {
        //  console.log('Client #' + socket.clientID + ' ended connection');
        //  // Handle logging out user
        //  removeDisconnectedCharacter.call(socket);
        // });
        // Need to find out which functions to use and make this tidyer....
        // Need to check for memory leaks and make sure we actually delete the un needed socket.
        // Need to make sure using splice won't be slower than deleting the index.
        // Should maybe look at using room or list rather than array of socket object.
        socket.on('close', function() {
            console.log('Client #' + socket.clientID + ' closed connection');
            console.log('world.js needs to remove socket from zone it is in too. and tell all party/guild its offline etc');
            
            if(socket.character.Party){
                console.log("Was in party...");
                if(socket.character.Party.leader.character.Name === socket.character.Name){
                    socket.character.Party.disband();
                }else{
                    socket.character.Party.logoutCharacter(socket.character.Name);
                }
            }
            
            removeDisconnectedCharacter.call(socket);
            //Let client know how many people are playing on server
            try {
                world.packets.onDisconnected(socket);
            } catch(e) {}
        });
        socket.on('disconnect', function() {
            console.log('Client #' + socket.clientID + ' disconnected');
            console.log('world.js needs to remove socket from zone it is in too. and tell all party/guild its offline etc');
            removeDisconnectedCharacter.call(socket);
        });

        function removeDisconnectedCharacter() {
            if(this.Destroying) return;
            this.Destroying = true;
            console.log('Removing disconnected character from world ' + this.character.Name);
            if(this.authenticated == false) {
                return;
            }

            
            this.character.Health = this.character.state.CurrentHP;
            this.character.Chi = this.character.state.CurrentChi;
            
            // Need to store zone transfer location different to current location.
            if(this.zoneTransfer) {
                console.log('removeDisconnectedCharacter ' + this.acocunt.Username)
                world.getSocketFromTransferQueue(this.account.Username);
                this.character.RealX = parseInt(this.character.state.ToLocation.X, 10);
                this.character.RealY = parseInt(this.character.state.ToLocation.Y, 10);
                this.character.RealZ = parseInt(this.character.state.ToLocation.Z, 10);
                console.log('removeDisconnectedCharacter zone transfer is: ' + this.character.state.ToLocation.toString());
                console.log(this.character.RealX + ' ' + this.character.RealY + ' ' + this.character.RealZ + ' ');
                this.character.MapID = this.character.ToMapID;
            } else {
                this.character.RealX = parseInt(this.character.state.Location.X, 10);
                this.character.RealY = parseInt(this.character.state.Location.Y, 10);
                this.character.RealZ = parseInt(this.character.state.Location.Z, 10);
            }
            this.character.save();
            // Tell clan members, party, friend that they went offline
            // Tell monsters or we to untarget
            // Cancel any timers we need too
            this.LogoutUser();
            world.removeClient(this);
        }
        socket.sendActionStateToArea = function() {
            this.Zone.sendToAllArea(this, true, packets.makeCompressedPacket(
            0x18, new Buffer(
            WorldPC.ActionReplyPacket.pack(
            this.character.state))), config.viewable_action_distance);
        }
        socket.sendInfoMessage = function(message) {
            // Could split this up if it takes up too many messages
            // Or we could use a custom packet or something to store it
            // in the System messages
            var i, j, temparray, chunk = 60;
            for(i = 0, j = message.length; i < j; i += packets.MessageLength) {
                temparray = message.slice(i, i + packets.MessageLength);
                if(!this._handle) return;
                this.write(new Buffer(
                packets.ChatPacketReply.pack({
                    PacketID: 0x2A,
                    Name: 'System',
                    Message: temparray
                })));
            };
        }
        // End of Socket Functions
        //Handle socket disconnection
        socket.on('end', function() {
            console.log('Client #' + socket.clientID + ' ended connection');
            world.removeClient(socket);
            delete world[socket.clientID];
            db.Account.logoutUser(socket);
        });
        socket.on('error', function(err) {
            console.log('Client #' + socket.clientID + ' error: ' + err);
            socket.destroy();
        });
        // Need to find out which functions to use and make this tidyer....
        // Need to check for memory leaks and make sure we actually delete the un needed socket.
        // Need to make sure using splice won't be slower than deleting the index.
        // Should maybe look at using room or list rather than array of socket object.
        socket.on('close', function() {
            console.log('Client #' + socket.clientID + ' closed connection');
            world.removeClient(socket);
            delete world[socket.clientID];
            //var i = allworld.clients.indexOf(socket);
            //delete allworld.clients[i];
            db.Account.logoutUser(socket);
        });
        socket.on('disconnect', function() {
            console.log('Client #' + socket.clientID + ' disconnected');
            world.removeClient(socket);
            delete world[socket.clientID];
            //var i = allworld.clients.indexOf(socket);
            //delete allworld.clients[i];
            // Remove from zone transfer list if its there
            db.Account.logoutUser(socket);
            try {
                world.packets.onDisconnected(socket);
            } catch(e) {
                dumpError(e);
            }
        });

        socket.write(new Buffer(packets.WorldServerInfoPacket.pack({
            packetID: 0x00
        })));

        socket.afterPacketsHandled = function(){
            socket.send2FUpdate();

            delete this.afterPacketsHandled;
        }

        CachedBuffer.call(socket, world.packets);
        //Let client know how many people are playing on server

        try {
            world.packets.onConnected(socket);
        } catch(e) {
            dumpError(e);
        }

        world.addClient(socket);
        world[socket.ID] = socket;
    };
    world.findAccountSocket = function(name) {
        for(var i = 0; i < world.clients.length; i++) {
            if(world.clients[i].authenticated) {
                if(world.clients[i].account.Username === name) {
                    return world.clients[i];
                }
            }
        }
        return null;
    };
    world.findSocketByCharacterID = function(CharacterID) {
        // Search connected world.clients
        for(var i = 0; i < world.clients.length; ++i) {
            if(world.clients[i].character._id == CharacterID && world.clients[i]._handle) {
                return world.clients[i];
            }
        }
        return null;
    };
    world.findCharacterSocket = function(Name) {
        for(var i = 0; i < world.clients.length; ++i) {
            if(world.clients[i].character.Name == Name && world.clients[i].authenticated) {
                return world.clients[i];
            }
        }
        return null;
    };
    world.addSocketToTransferQueue = function(socket) {
        if(socket.authenticated == false) return;
        // set a timeout on the object for logging out the account if it is not removed from world list
        socket.zoneTransferLogout = socket.setTimeout(socket.LogoutUser, config.zoneTransferLogoutTimer || 60000);
        world.socket_transfers.push(socket);
    }
    world.getSocketFromTransferQueue = function(Username) {
        var socket = null;
        for(var i = 0; i < world.socket_transfers.length; ++i) {
            var t = world.socket_transfers[i];
            if(t.authenticated == true && t.zoneTransfer == true && t.account.Username == Username) {
                socket = t;
                clearTimeout(socket.zoneTransferLogout);
                world.socket_transfers.splice(world.socket_transfers.indexOf(socket), 1);
                break;
            }
        }
        return socket;
    }
    world.findSocketInTransferQueue = function(Username) {
        var socket = null;
        for(var i = 0; i < world.socket_transfers.length; ++i) {
            var t = world.socket_transfers[i];
            if(t.authenticated == true && t.zoneTransfer == true && t.account.Username == Username) {
                socket = t;
                break;
            }
        }
        return socket;
    }
    // sendToAll
    world.sendToAll = function(buffer) {
        for(var i = 0; i < world.clients.length; ++i) {
            var socket = world.clients[i];
            if(socket.authenticated) {
                socket.write(buffer);
            }
        }
    }
    world.sendInfoMessageToAll = function(string) {
        for(var i = 0; i < world.clients.length; ++i) {
            var socket = world.clients[i];
            if(socket.authenticated) {
                socket.sendInfoMessage(buffer);
            }
        }
    }
    world.sendToClan = function(clan, buffer) {
        for(var i = 0; i < world.clients.length; ++i) {
            var socket = world.clients[i];
            if(socket.authenticated) {
                if(socket.character.Clan == clan) {
                    socket.write(buffer);
                }
            }
        }
    }
    world.sendToZone = function(zoneID, buffer) {
        if(zones[zoneID]) {
            zones[zoneID].sendToAll(buffer);
        }
    }
    // End of helper functions  
    // TODO: Implement server side game simulation so things really do move and are in correct spots.
    world.step = function(delta) {
        // Check if running
        if(this.running === false) return;
        // Foreach Zone call .step
        var keys = Object.keys(zones);
        for(var i = 0; i < keys.length; ++i) {
            if(zones[keys[i]]) {
                zones[keys[i]].step(delta);
            }
        }
        // Foreach Client call .step
    }
    world.addClient = function(socket) {
        // Can attach things here if we need to
        // Call Attach Hooks 
        // setupClient(socket);
        world.clients.push(socket);
    }
    world.removeClient = function(socket) {
        // Call Remove Hooks
        for(var i=0; i < world.clients.length; i++){
            if(world.clients[i] && world.clients[i].character.Name === socket.character.Name){
                world.clients.splice(i, 1);
                break;
            }
        }
    }
    world.zoneLoaded = function(err, id) {
        if(err) {
            console.error('\x1B[31m' + 'Zone: ' + id + ' Failed to load' + '\x1B[0m');
            return;
        }
        if(zones[id] === undefined) {
            console.info('\x1B[33m' + 'Zone: ' + id + ' Skipped' + '\x1B[0m');
        } else {
            console.info('\x1B[32m' + 'Zone: ' + id + ' Loaded successfully' + '\x1B[0m');
        }
    }
    // TODO: Handle the alias zones.
    // These are zones which have a different id but the same files as another zone id.
    world.loadAllZones = function() {
        console.log('Loading Zones...');
        if(config.Zones !== undefined) {
            var mapLoadQueue = async.queue(world.loadZone, config.AsyncZoneLoadLimit || 4);
            for(var id in config.Zones) {
                if(config.Zones.hasOwnProperty(id) && !isNaN(id)) {
                    mapLoadQueue.push(id, world.doneZoneLoad);
                }
            }
            world.Loaded = false;
            mapLoadQueue.drain = function() {
                if (world.Loaded === false) {
                    world.Loaded = true;
                    console.log('Finished loading zones!\nYou can now login to the server.');
                    main.events.emit('ready');
                }
            }
        } else {
            console.error('\x1B[31mPlease define Zones object in your config.json\x1B[0m');
        }
    }
    world.loadZone = function(ZoneID, callback) {
        if(callback === undefined) callback = world.zoneLoaded;
        //console.log('Loading Zone: '+ZoneID);
        // Check if ZoneID is number or object
        if(typeof(ZoneID) === 'object') {
            ZoneID = ZoneID.ID;
        }
        if(zones[ZoneID] && config.Zones[ZoneID].Load == false) {
            // TODO: Unload the zone.
            callback(null, ZoneID)
            return;
        }
        if(zones[ZoneID] === undefined && config.Zones[ZoneID].Load) {
            console.log('ZoneID is: ' + ZoneID);
            zones[ZoneID] = new Zone(ZoneID);
            zones[ZoneID].Load(callback);
        } else {
            console.log('Zone ' + ZoneID + ' Already Loaded');
            callback('Zone ' + ZoneID + ' Already Loaded');
        }
    }
    world.unloadZone = function(ZoneID) {
        if(zones[ZoneID] !== undefined) {
            zones[ZoneID].unload();
            //main.events.emit('unload_zone',ZoneID);
            delete zones[ZoneID];
        } else {
            console.log('Zone Not Loaded');
        }
    }

    if(!world.guilds){
        world.guilds = {};
    }

    world.guildBindFunctionsOnCreate = function(gObj){
        gObj.isMember = function(socket){
            console.log('# Checking if character is a member of guild');
            for(var i=0; i<gObj.Members.length; i++){
                var member = gObj.Members[i];
                if(!member) continue;
                if(socket.character.Name === member.Name){
                    console.log(socket.character.Name + ' is Member of: ' + socket.character.GuildName);
                    member.Socket = socket;
                    socket.character.Guild = gObj;
                    socket.character.GuildMemberObj = member;
                    socket.character.Guild.setState(socket);
                    return true;
                }
            }
            return null;
        }

        gObj.removeMember = function(socket){
            console.log("# removing member from guild");
            for(var i=0; i<gObj.Members.length; i++){
                var member = gObj.Members[i];
                if(socket.character.Name === member.Name){
                    delete gObj.Members[i];
                    socket.character.GuildName = null;
                    socket.character.Guild = null;
                    socket.character.GuildMemberObj = null;

                    socket.character.save();
                }
            }
        }

        gObj.getLeader = function(){
            // TODO: If online check of socket and return socket or obj with socket
            for(var i=0; i<gObj.Members.length; i++){
                var member = gObj.Members[i];
                if(member.LeaderFlag === 2){
                    return member;
                }
            }
        }

        gObj.addMember = function(socket){
            gObj.Members.push(
                {
                    Name: socket.character.Name,
                    LeaderFlag: 0 // 2 = master, 1 = Assistant, 0 = Member
                }
            );
            if(!gObj.isMember(socket)) return;
            gObj.setState(socket);
            gObj.save();
        }

        gObj.setMember = function(socket){
            socket.character.GuildMemberObj.LeaderFlag = 0;
            socket.character.Guild.setState(socket);
        }

        gObj.setAssistant = function(socket){
            socket.character.GuildMemberObj.LeaderFlag = 1;
            socket.character.Guild.setState(socket);
        }

        gObj.setLeader = function(socket){
            socket.character.GuildMemberObj.LeaderFlag = 2;
            socket.character.Guild.setState(socket);
        }

        gObj.setState = function(socket){
            console.log("Settings state for: " + socket.character.Name);
            switch(socket.character.GuildMemberObj.LeaderFlag){
                case 0:
                socket.character.state.LeaderFlag = 1;
                socket.character.state.LeaderSubFlag = 3;
                socket.character.GuildAccess = 2;
                break;

                case 1:
                socket.character.state.LeaderFlag = 4;
                socket.character.state.LeaderSubFlag = 1;
                socket.character.GuildAccess = 1;
                break;

                case 2:
                socket.character.state.LeaderFlag = 0;
                socket.character.state.LeaderSubFlag = 0;
                socket.character.GuildAccess = 0;
                break;
            }

            socket.character.InGuild = 1;
            socket.character.state.setFromCharacter(socket.character);
            socket.character.save();
        }
    }

    world.prepareGuilds = function(){
        console.log('# Preparing guilds');
        db.Guild.find({}, function(error, guild) {
            if (error) {
                // Handle error here
                dumpError(error);
                return;
            }

            for(var i=0; i < guild.length; i++){
                var gObj = guild[i];
                world.guilds[gObj.Name] = gObj;
                world.guildBindFunctionsOnCreate(world.guilds[gObj.Name]);
            }

            console.log("# Total of " + guild.length + " has been loaded");
        });
    }

    world.findGuildByName = function(name){
        if(!name){
            console.log("# there was no guild name to be look for");
            return;
        }

        if(world.guilds[name]){
            console.log("# we found a guild. In world.guilds object");
            return world.guilds[name];
        }else{
            console.log("# guild have not been found");
            return null;
        }
    }


    if(world.start) {
        world.start();
        delete world.start;
    }
});