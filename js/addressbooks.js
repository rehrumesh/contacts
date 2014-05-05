OC.Contacts = OC.Contacts || {};


(function(window, $, OC) {
	'use strict';

	var AddressBook = function(storage, book, template, isFileAction) {
		this.isFileAction = isFileAction || false;
		this.storage = storage;
		this.book = book;
		this.$template = template;
		this.addressBooks = new OC.Contacts.AddressBookList(
			this.storage,
			$('#app-settings-content'),
			$('#addressBookTemplate')
		);
	};

	AddressBook.prototype.render = function() {
		var self = this;
		this.$li = this.$template.octemplate({
			id: this.book.id,
			displayname: this.book.displayname,
			backend: this.book.backend,
			permissions: this.book.permissions
		});
		if (this.isFileAction) {
			return this.$li;
		}
		this.$li.find('a.action').tipsy({gravity: 'w'});
		if (!this.hasPermission(OC.PERMISSION_DELETE)) {
			this.$li.find('a.action.delete').hide();
		}
		if (!this.hasPermission(OC.PERMISSION_UPDATE)) {
			this.$li.find('a.action.edit').hide();
		}
		if (!this.hasPermission(OC.PERMISSION_SHARE)) {
			this.$li.find('a.action.share').hide();
		}
		if (['local', 'ldap'].indexOf(this.getBackend()) === -1) {
			this.$li.find('a.action.carddav').hide();
		}
		this.$li.find('input:checkbox').prop('checked', this.book.active).on('change', function() {
			console.log('activate', self.getId());
			var checkbox = $(this).get(0);
			self.setActive(checkbox.checked, function(response) {
				if(!response.error) {
					self.book.active = checkbox.checked;
				} else {
					checkbox.checked = !checkbox.checked;
				}
			});
		});
		this.$li.find('a.action.download')
			.attr('href', OC.generateUrl(
				'apps/contacts/addressbook/{backend}/{addressBookId}/export',
				{
					backend: this.getBackend(),
					addressBookId: this.getId()
				}
			));
		this.$li.find('a.action.delete').on('click keypress', function() {
			$('.tipsy').remove();
			console.log('delete', self.getId());
			self.destroy();
		});
		this.$li.find('a.action.carddav').on('click keypress', function() {
			var uri = (self.book.owner === oc_current_user ) ? self.book.uri : self.book.uri + '_shared_by_' + self.book.owner;
			var link = OC.linkToRemote('carddav')+'/addressbooks/'+encodeURIComponent(oc_current_user)+'/'+encodeURIComponent(uri);
			var $dropdown = $('<li><div id="dropdown" class="drop"><input type="text" value="{link}" readonly /></div></li>')
				.octemplate({link:link}).insertAfter(self.$li);
			var $input = $dropdown.find('input');
			$input.focus().get(0).select();
			$input.on('blur', function() {
				$dropdown.hide('blind', function() {
					$dropdown.remove();
				});
			});
		});
		this.$li.find('a.action.edit').on('click keypress', function(event) {
			if($(this).data('open')) {
				return;
			}
			var editor = this;
			event.stopPropagation();
			event.preventDefault();
			var $dropdown = $('<li><div><input type="text" value="{name}" /></div></li>')
				.octemplate({name:self.getDisplayName()}).insertAfter(self.$li);
			var $input = $dropdown.find('input');
			//$input.focus().get(0).select();
			$input.addnew({
				autoOpen: true,
				//autoClose: false,
				addText: t('contacts', 'Save'),
				ok: function(event, name) {
					console.log('edit-address-book ok', name);
					$input.addClass('loading');
					self.update({displayname:name}, function(response) {
						console.log('response', response);
						if(response.error) {
							$(document).trigger('status.contacts.error', response);
						} else {
							self.setDisplayName(response.data.displayname);
							$input.addnew('close');
						}
						$input.removeClass('loading');
					});
				},
				close: function() {
					$dropdown.remove();
					$(editor).data('open', false);
				}
			});
			$(this).data('open', true);
		});
		return this.$li;
	};

	AddressBook.prototype.getId = function() {
		return String(this.book.id);
	};

	AddressBook.prototype.getBackend = function() {
		return this.book.backend;
	};

	AddressBook.prototype.getDisplayName = function() {
		return this.book.displayname;
	};

	AddressBook.prototype.setDisplayName = function(name) {
		this.book.displayname = name;
		this.$li.find('label').text(escapeHTML(name));
	};

	AddressBook.prototype.getPermissions = function() {
		return this.book.permissions;
	};

	AddressBook.prototype.hasPermission = function(permission) {
		return (this.getPermissions() & permission);
	};

	AddressBook.prototype.getOwner = function() {
		return this.book.owner;
	};

	AddressBook.prototype.getMetaData = function() {
		return {
			permissions:this.getPermissions,
			backend: this.getBackend(),
			id: this.getId(),
			displayname: this.getDisplayName()
		};
	};

	/**
	 * Update address book in data store
	 * @param object properties An object current only supporting the property 'displayname'
	 * @param cb Optional callback function which
	 * @return An object with a boolean variable 'error'.
	 */
	AddressBook.prototype.update = function(properties, cb) {
		return $.when(this.storage.updateAddressBook(this.getBackend(), this.getId(), {properties:properties}))
			.then(function(response) {
			if(response.error) {
				$(document).trigger('status.contacts.error', response);
			}
			cb(response);
		});
	};

	AddressBook.prototype.isActive = function() {
		return this.book.active;
	};

	/**
	 * Save an address books active state to data store.
	 * @param bool state
	 * @param cb Optional callback function which
	 * @return An object with a boolean variable 'error'.
	 */
	AddressBook.prototype.setActive = function(state, cb) {
		var self = this;
		return $.when(this.storage.activateAddressBook(this.getBackend(), this.getId(), state))
			.then(function(response) {
			if(response.error) {
				$(document).trigger('status.contacts.error', response);
			} else {
				$(document).trigger('status.addressbook.activated', {
					addressbook: self,
					state: state
				});
			}
			cb(response);
		});
	};

	/**
	 * Delete a list of contacts from the data store
	 * @param array contactsIds An array of contact ids to be deleted.
	 * @param cb Optional callback function which will be passed:
	 * @return An object with a boolean variable 'error'.
	 */
	AddressBook.prototype.deleteContacts = function(contactsIds, cb) {
		console.log('deleteContacts', contactsIds);
		return $.when(this.storage.deleteContacts(this.getBackend(), this.getId(), contactsIds))
			.then(function(response) {
			if(response.error) {
				$(document).trigger('status.contacts.error', response);
			}
			if(typeof cb === 'function') {
				cb(response);
			}
		});
	};

	/**
	 * Delete address book from data store and remove it from the DOM
	 * @return An object with a boolean variable 'error'.
	 */
	AddressBook.prototype.destroy = function() {
		var self = this;
		$.when(this.storage.deleteAddressBook(this.getBackend(), self.getId()))
			.then(function(response) {
			if(!response.error) {
				self.$li.remove();
				$(document).trigger('status.addressbook.removed', {
					addressbook: self
				});
			} else {
				$(document).trigger('status.contacts.error', response);
			}
		}).fail(function(response) {
			console.log(response.message);
			$(document).trigger('status.contacts.error', response);
		});
	};

	/**
	 * Controls access to address books
	 */
	var AddressBookList = function(
			storage,
			bookTemplate,
			bookItemTemplate,
			isFileAction
		) {
		var self = this;
		this.isFileAction = isFileAction || false;
		this.storage = storage;
		this.$bookTemplate = bookTemplate;
		this.$bookList = this.$bookTemplate.find('.addressbooklist');
		this.$bookItemTemplate = bookItemTemplate;
		this.$importIntoSelect = $('#import_into');
		this.$importFormatSelect = this.$bookTemplate.find('#import_format');
		this.$importProgress = this.$bookTemplate.find('#import-status-progress');
		this.$importStatusText = this.$bookTemplate.find('#import-status-text');
		this.addressBooks = [];

		if(this.isFileAction) {
			return;
		}
		this.$importFileInput = this.$bookTemplate.find('#import_upload_start');
		var $addInput = this.$bookTemplate.find('#add-address-book');
		$addInput.addnew({
			ok: function(event, name) {
				console.log('add-address-book ok', name);
				$addInput.addClass('loading');
				self.add(name, function(response) {
					console.log('response', response);
					if(response.error) {
						$(document).trigger('status.contacts.error', response);
					} else {
						$(this).addnew('close');
					}
					$addInput.removeClass('loading');
				});
			}
		});

		$(document).bind('status.addressbook.removed', function(e, data) {
			var addressBook = data.addressbook;
			self.addressBooks.splice(self.addressBooks.indexOf(addressBook), 1);
			self.buildImportSelect();
		});
		$(document).bind('status.addressbook.added', function() {
			self.buildImportSelect();
		})
		this.$importFormatSelect.on('change', function() {
			self.$importIntoSelect.trigger('change');
		});
		this.$importIntoSelect.on('change', function() {
			// Disable file input if no address book selected
			var value = $(this).val();
			self.$importFileInput.prop('disabled', value === '-1' );
			if(value !== '-1') {
				var url = OC.generateUrl(
					'apps/contacts/addressbook/{backend}/{addressBookId}/{importType}/import/upload',
					{
						addressBookId:value,
						importType:self.$importFormatSelect.find('option:selected').val(),
						backend: $(this).find('option:selected').data('backend')
					}
				);
				self.$importFileInput.fileupload('option', 'url', url);
			}
		});
		this.$importFileInput.fileupload({
			dataType: 'json',
			start: function(e, data) {
				self.$importProgress.progressbar({value:false});
				$('.tipsy').remove();
				$('.import-upload').hide();
				$('.import-status').show();
				self.$importProgress.fadeIn();
				self.$importStatusText.text(t('contacts', 'Starting file import'));
			},
			done: function (e, data) {
				if ($('#import_format').find('option:selected').val() != 'automatic') {
					$('#import-status-text').text(t('contacts', 'Format selected: {format}',
													{format: $('#import_format').find('option:selected').text() }));
				} else {
					$('#import-status-text').text(t('contacts', 'Automatic format detection'));
				}
				console.log('Upload done:', data);
				self.doImport(self.storage.formatResponse(data.jqXHR));
			},
			fail: function(e, data) {
				console.log('fail', data);
				OC.notify({message:data.errorThrown + ': ' + data.textStatus});
				$('.import-upload').show();
				$('.import-status').hide();
			}
		});
		$('#import-contacts').on('click keypress', function() {
			var $rightContent = $('#app-content');
			$rightContent.append('<div id="import-dialog"></div>');
			var $dlg = $('#contactsImportTemplate').octemplate();
			var $divDlg = $('#import-dialog');
			$divDlg.html($dlg).ocdialog({
				modal: true,
				closeOnEscape: true,
				title: t('contacts', 'Import contacts'),
				height: '220',
				width: 'auto',
				buttons: [
					{
						text: t('contacts', 'Close'),
						click: function() {
							$divDlg.ocdialog().ocdialog('close');
							$divDlg.ocdialog().ocdialog('destroy').remove();
						}
					}
				],
				close: function(/*event, ui*/) {
					$divDlg.ocdialog().ocdialog('close');
					$divDlg.ocdialog().ocdialog('destroy').remove();
				},
				open: function(/*event, ui*/) {
					self.buildImportSelect();
				}
			});
		});
	};

	AddressBookList.prototype.count = function() {
		return this.addressBooks.length;
	};

	/**
	 * For importing from oC filesyatem
	 */
	AddressBookList.prototype.prepareImport = function(backend, addressBookId, importType, path, fileName) {
		console.log('prepareImport', backend, addressBookId, importType, path, fileName);
		this.$importProgress.progressbar({value:false});
		if (importType != 'automatic') {
			this.$importStatusText.text(t('contacts', 'Format selected: {format}',
											{format: self.$importFormatSelect.find('option:selected').val() }));
		} else {
			this.$importStatusText.text(t('contacts', 'Automatic format detection'));
		}
		return this.storage.prepareImport(
				backend, addressBookId, importType,
				{filename:fileName, path:path}
			);
	};

	AddressBookList.prototype.doImport = function(response) {
		console.log('doImport', response);
		var defer = $.Deferred();
		var done = false;
		var interval = null, isChecking = false;
		var self = this;
		var closeImport = function() {
			defer.resolve();
			self.$importProgress.fadeOut();
			setTimeout(function() {
				$('.import-upload').show();
				$('.import-status').hide();
				self.importCount = null;
				if(self.$importProgress.hasClass('ui-progressbar')) {
					self.$importProgress.progressbar('destroy');
				}
			}, 3000);
		};
		if(!response.error) {
			this.$importProgress.progressbar('value', 0);
			var data = response.data;
			var getStatus = function(backend, addressbookid, importType, progresskey, interval, done) {
				if(done) {
					clearInterval(interval);
					closeImport();
					return;
				}
				if(isChecking) {
					return;
				}
				isChecking = true;
				$.when(
					self.storage.importStatus(
						backend, addressbookid, importType,
						{progresskey:progresskey}
					))
				.then(function(response) {
					if(!response.error) {
						console.log('status, response: ', response);
						if (response.data.total != null && response.data.progress != null) {
							self.$importProgress.progressbar('option', 'max', Number(response.data.total));
							self.$importProgress.progressbar('value', Number(response.data.progress));
							self.$importStatusText.text(t('contacts', 'Processing {count}/{total} cards',
														{count: response.data.progress, total: response.data.total}));
						}
					} else {
						console.warn('Error', response.message);
						self.$importStatusText.text(response.message);
					}
					isChecking = false;
				}).fail(function(response) {
					console.log(response.message);
					$(document).trigger('status.contacts.error', response);
					isChecking = false;
				});
			};
			$.when(
				self.storage.startImport(
					data.backend, data.addressBookId, data.importType,
					{filename:data.filename, progresskey:data.progresskey}
				)
			)
			.then(function(response) {
				console.log('response', response);
				if(!response.error) {
					console.log('Import done');
					self.$importStatusText.text(t('contacts', 'Total:{total}, Success:{imported}, Errors:{failed}',
													  {total: response.data.total, imported:response.data.imported, failed: response.data.failed}));
					var addressBook = self.find({id:response.data.addressBookId, backend: response.data.backend});
					$(document).trigger('status.addressbook.imported', {
						addressbook: addressBook
					});
					defer.resolve();
				} else {
					defer.reject(response);
					self.$importStatusText.text(response.message);
					$(document).trigger('status.contacts.error', response);
				}
				done = true;
			}).fail(function(response) {
				defer.reject(response);
				console.log(response.message);
				$(document).trigger('status.contacts.error', response);
				done = true;
			});
			interval = setInterval(function() {
				getStatus(data.backend, data.addressBookId, data.importType, data.progresskey, interval, done);
			}, 1500);
		} else {
			defer.reject(response);
			done = true;
			self.$importStatusText.text(response.message);
			closeImport();
			$(document).trigger('status.contacts.error', response);
		}
		return defer;
	};

	/**
	 * Rebuild the select to choose which address book to import into.
	 */
	AddressBookList.prototype.buildImportSelect = function() {
		console.log('buildImportSelect', this);
		var self = this;
		this.$importIntoSelect.find('option:not([value="-1"])').remove();
		var addressBooks = self.selectByPermission(OC.PERMISSION_UPDATE);
		if (addressBooks.length > 0) {
			console.log('ImportInto Select', self.$importIntoSelect);
			//console.log('addressbooks', addressBooks);
			$.each(addressBooks, function(idx, book) {
				var $opt = $('<option />');
				$opt.val(book.getId()).text(book.getDisplayName()).data('backend', book.getBackend());
				self.$importIntoSelect.append($opt);
				console.log('appending', $opt, 'to', self.$importIntoSelect);
			});
			if(!this.isFileAction) {
				if(addressBooks.length === 1) {
					//console.log("coin !");
					this.$importIntoSelect.val(this.$importIntoSelect.find('option:not([value="-1"])').first().val()).hide().trigger('change');
					self.$importFileInput.prop('disabled', false);
				} else {
					//console.log("coin !!!");
					this.$importIntoSelect.show();
					self.$importFileInput.prop('disabled', true);
				}
			}
		}
	};

	/**
	 * Create an AddressBook object, save it in internal list and append it's rendered result to the list
	 *
	 * @param object addressBook
	 * @param bool rebuild If true rebuild the address book select for import.
	 * @return AddressBook
	 */
	AddressBookList.prototype.insertAddressBook = function(addressBook) {
		var book = new AddressBook(this.storage, addressBook, this.$bookItemTemplate, this.isFileAction);
		if(!this.isFileAction) {
			var result = book.render();
			this.$bookList.append(result);
		}
		this.addressBooks.push(book);
		return book;
	};

	/**
	 * Get an AddressBook
	 *
	 * @param object info An object with the string  properties 'id' and 'backend'
	 * @return AddressBook|null
	 */
	AddressBookList.prototype.find = function(info) {
		console.log('AddressBookList.find', info);
		var addressBook = null;
		$.each(this.addressBooks, function(idx, book) {
			if(book.getId() === String(info.id) && book.getBackend() === info.backend) {
				addressBook = book;
				return false; // break loop
			}
		});
		return addressBook;
	};

	/**
	 * Move a contacts from one address book to another..
	 *
	 * @param Contact The contact to move
	 * @param object from An object with properties 'id' and 'backend'.
	 * @param object target An object with properties 'id' and 'backend'.
	 */
	AddressBookList.prototype.moveContact = function(contact, from, target) {
		console.log('AddressBookList.moveContact, contact', contact, from, target);
		$.when(this.storage.moveContact(from.backend, from.id, contact.getId(), {target:target}))
			.then(function(response) {
			if(!response.error) {
				console.log('Contact moved', response);
				$(document).trigger('status.contact.moved', {
					contact: contact,
					data: response.data
				});
			} else {
				$(document).trigger('status.contacts.error', response);
			}
		});
	};

	/**
	 * Get an array of address books with at least the required permission.
	 *
	 * @param int permission
	 * @param bool noClone If true the original objects will be returned and can be manipulated.
	 */
	AddressBookList.prototype.selectByPermission = function(permission, noClone) {
		var books = [];
		$.each(this.addressBooks, function(idx, book) {
			if(book.getPermissions() & permission) {
				// Clone the address book not to mess with with original
				books.push(noClone ? book : $.extend(true, {}, book));
			}
		});
		return books;
	};

	/**
	 * Add a new address book.
	 *
	 * @param string name
	 * @param function cb
	 * @return jQuery.Deferred
	 * @throws Error
	 */
	AddressBookList.prototype.add = function(name, cb) {
		console.log('AddressBookList.add', name, typeof cb);
		var defer = $.Deferred();
		// Check for wrong, duplicate or empty name
		if(typeof name !== 'string') {
			throw new TypeError('BadArgument: AddressBookList.add() only takes String arguments.');
		}
		if(name.trim() === '') {
			throw new Error('BadArgument: Cannot add an address book with an empty name.');
		}
		var error = '';
		$.each(this.addressBooks, function(idx, book) {
			if(book.getDisplayName() === name) {
				console.log('Dupe');
				error = t('contacts', 'An address book called {name} already exists', {name:name});
				if(typeof cb === 'function') {
					cb({error:true, message:error});
				}
				defer.reject({error:true, message:error});
				return false; // break loop
			}
		});
		if(error.length) {
			console.warn('Error:', error);
			return defer;
		}
		var self = this;
		$.when(this.storage.addAddressBook('local',
		{displayname: name, description: ''})).then(function(response) {
			if(response.error) {
				error = response.message;
				if(typeof cb === 'function') {
					cb({error:true, message:error});
				}
				defer.reject(response);
			} else {
				var book = self.insertAddressBook(response.data);
				$(document).trigger('status.addressbook.added');
				if(typeof cb === 'function') {
					cb({error:false, addressbook: book});
				}
				defer.resolve({error:false, addressbook: book});
			}
		})
		.fail(function(jqxhr, textStatus, error) {
			$(this).removeClass('loading');
			var err = textStatus + ', ' + error;
			console.log('Request Failed', + err);
			error = t('contacts', 'Failed adding address book: {error}', {error:err});
			if(typeof cb === 'function') {
				cb({error:true, message:error});
			}
			defer.reject({error:true, message:error});
		});
		return defer;
	};

	/**
	* Load address books
	*/
	AddressBookList.prototype.loadAddressBooks = function() {
		var self = this;
		var defer = $.Deferred();
		$.when(this.storage.getAddressBooksForUser()).then(function(response) {
			if(!response.error) {
				$.each(response.data.addressbooks, function(idx, addressBook) {
					self.insertAddressBook(addressBook);
				});
				self.buildImportSelect();
				console.log('After buildImportSelect');
				if(!self.isFileAction) {
					if(typeof OC.Share !== 'undefined') {
						OC.Share.loadIcons('addressbook');
					} else {
						self.$bookList.find('a.action.share').css('display', 'none');
					}
				}
				console.log('Before resolve');
				defer.resolve(self.addressBooks);
				console.log('After resolve');
			} else {
				defer.reject(response);
				$(document).trigger('status.contacts.error', response);
			}
		})
		.fail(function(response) {
			console.warn('Request Failed:', response);
			defer.reject({
				error: true,
				message: t('contacts', 'Failed loading address books: {error}', {error:response.message})
			});
		});
		return defer.promise();
	};

	OC.Contacts.AddressBookList = AddressBookList;

})(window, jQuery, OC);


////////////////////////////////////////////////////////
// Domain Public by Eric Wendelin http://eriwen.com/ (2008)
//                  Luke Smith http://lucassmith.name/ (2008)
//                  Loic Dachary <loic@dachary.org> (2008)
//                  Johan Euphrosine <proppy@aminche.com> (2008)
//                  Oyvind Sean Kinsey http://kinsey.no/blog (2010)
//                  Victor Homyakov <victor-homyakov@users.sourceforge.net> (2010)
/*global module, exports, define, ActiveXObject*/
(function(global, factory) {
    if (typeof exports === 'object') {
        // Node
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // Browser globals
        global.printStackTrace = factory();
    }
}(this, function() {
    /**
     * Main function giving a function stack trace with a forced or passed in Error
     *
     * @cfg {Error} e The error to create a stacktrace from (optional)
     * @cfg {Boolean} guess If we should try to resolve the names of anonymous functions
     * @return {Array} of Strings with functions, lines, files, and arguments where possible
     */
    function printStackTrace(options) {
        options = options || {guess: true};
        var ex = options.e || null, guess = !!options.guess;
        var p = new printStackTrace.implementation(), result = p.run(ex);
        return (guess) ? p.guessAnonymousFunctions(result) : result;
    }

    printStackTrace.implementation = function() {
    };

    printStackTrace.implementation.prototype = {
        /**
         * @param {Error} [ex] The error to create a stacktrace from (optional)
         * @param {String} [mode] Forced mode (optional, mostly for unit tests)
         */
        run: function(ex, mode) {
            ex = ex || this.createException();
            mode = mode || this.mode(ex);
            if (mode === 'other') {
                return this.other(arguments.callee);
            } else {
                return this[mode](ex);
            }
        },

        createException: function() {
            try {
                this.undef();
            } catch (e) {
                return e;
            }
        },

        /**
         * Mode could differ for different exception, e.g.
         * exceptions in Chrome may or may not have arguments or stack.
         *
         * @return {String} mode of operation for the exception
         */
        mode: function(e) {
            if (e['arguments'] && e.stack) {
                return 'chrome';
            }

            if (e.stack && e.sourceURL) {
                return 'safari';
            }

            if (e.stack && e.number) {
                return 'ie';
            }

            if (e.stack && e.fileName) {
                return 'firefox';
            }

            if (e.message && e['opera#sourceloc']) {
                // e.message.indexOf("Backtrace:") > -1 -> opera9
                // 'opera#sourceloc' in e -> opera9, opera10a
                // !e.stacktrace -> opera9
                if (!e.stacktrace) {
                    return 'opera9'; // use e.message
                }
                if (e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
                    // e.message may have more stack entries than e.stacktrace
                    return 'opera9'; // use e.message
                }
                return 'opera10a'; // use e.stacktrace
            }

            if (e.message && e.stack && e.stacktrace) {
                // e.stacktrace && e.stack -> opera10b
                if (e.stacktrace.indexOf("called from line") < 0) {
                    return 'opera10b'; // use e.stacktrace, format differs from 'opera10a'
                }
                // e.stacktrace && e.stack -> opera11
                return 'opera11'; // use e.stacktrace, format differs from 'opera10a', 'opera10b'
            }

            if (e.stack && !e.fileName) {
                // Chrome 27 does not have e.arguments as earlier versions,
                // but still does not have e.fileName as Firefox
                return 'chrome';
            }

            return 'other';
        },

        /**
         * Given a context, function name, and callback function, overwrite it so that it calls
         * printStackTrace() first with a callback and then runs the rest of the body.
         *
         * @param {Object} context of execution (e.g. window)
         * @param {String} functionName to instrument
         * @param {Function} callback function to call with a stack trace on invocation
         */
        instrumentFunction: function(context, functionName, callback) {
            context = context || window;
            var original = context[functionName];
            context[functionName] = function instrumented() {
                callback.call(this, printStackTrace().slice(4));
                return context[functionName]._instrumented.apply(this, arguments);
            };
            context[functionName]._instrumented = original;
        },

        /**
         * Given a context and function name of a function that has been
         * instrumented, revert the function to it's original (non-instrumented)
         * state.
         *
         * @param {Object} context of execution (e.g. window)
         * @param {String} functionName to de-instrument
         */
        deinstrumentFunction: function(context, functionName) {
            if (context[functionName].constructor === Function &&
                context[functionName]._instrumented &&
                context[functionName]._instrumented.constructor === Function) {
                context[functionName] = context[functionName]._instrumented;
            }
        },

        /**
         * Given an Error object, return a formatted Array based on Chrome's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        chrome: function(e) {
            return (e.stack + '\n')
                .replace(/^[\s\S]+?\s+at\s+/, ' at ') // remove message
                .replace(/^\s+(at eval )?at\s+/gm, '') // remove 'at' and indentation
                .replace(/^([^\(]+?)([\n$])/gm, '{anonymous}() ($1)$2')
                .replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}() ($1)')
                .replace(/^(.+) \((.+)\)$/gm, '$1@$2')
                .split('\n')
                .slice(0, -1);
        },

        /**
         * Given an Error object, return a formatted Array based on Safari's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        safari: function(e) {
            return e.stack.replace(/\[native code\]\n/m, '')
                .replace(/^(?=\w+Error\:).*$\n/m, '')
                .replace(/^@/gm, '{anonymous}()@')
                .split('\n');
        },

        /**
         * Given an Error object, return a formatted Array based on IE's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        ie: function(e) {
            return e.stack
                .replace(/^\s*at\s+(.*)$/gm, '$1')
                .replace(/^Anonymous function\s+/gm, '{anonymous}() ')
                .replace(/^(.+)\s+\((.+)\)$/gm, '$1@$2')
                .split('\n')
                .slice(1);
        },

        /**
         * Given an Error object, return a formatted Array based on Firefox's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        firefox: function(e) {
            return e.stack.replace(/(?:\n@:0)?\s+$/m, '')
                .replace(/^(?:\((\S*)\))?@/gm, '{anonymous}($1)@')
                .split('\n');
        },

        opera11: function(e) {
            var ANON = '{anonymous}', lineRE = /^.*line (\d+), column (\d+)(?: in (.+))? in (\S+):$/;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var location = match[4] + ':' + match[1] + ':' + match[2];
                    var fnName = match[3] || "global code";
                    fnName = fnName.replace(/<anonymous function: (\S+)>/, "$1").replace(/<anonymous function>/, ANON);
                    result.push(fnName + '@' + location + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        opera10b: function(e) {
            // "<anonymous function: run>([arguments not available])@file://localhost/G:/js/stacktrace.js:27\n" +
            // "printStackTrace([arguments not available])@file://localhost/G:/js/stacktrace.js:18\n" +
            // "@file://localhost/G:/js/test/functional/testcase1.html:15"
            var lineRE = /^(.*)@(.+):(\d+)$/;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i++) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var fnName = match[1] ? (match[1] + '()') : "global code";
                    result.push(fnName + '@' + match[2] + ':' + match[3]);
                }
            }

            return result;
        },

        /**
         * Given an Error object, return a formatted Array based on Opera 10's stacktrace string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        opera10a: function(e) {
            // "  Line 27 of linked script file://localhost/G:/js/stacktrace.js\n"
            // "  Line 11 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html: In function foo\n"
            var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var fnName = match[3] || ANON;
                    result.push(fnName + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        // Opera 7.x-9.2x only!
        opera9: function(e) {
            // "  Line 43 of linked script file://localhost/G:/js/stacktrace.js\n"
            // "  Line 7 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html\n"
            var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
            var lines = e.message.split('\n'), result = [];

            for (var i = 2, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(ANON + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        // Safari 5-, IE 9-, and others
        other: function(curr) {
            var ANON = '{anonymous}', fnRE = /function(?:\s+([\w$]+))?\s*\(/, stack = [], fn, args, maxStackSize = 10;
            var slice = Array.prototype.slice;
            while (curr && stack.length < maxStackSize) {
                fn = fnRE.test(curr.toString()) ? RegExp.$1 || ANON : ANON;
                try {
                    args = slice.call(curr['arguments'] || []);
                } catch (e) {
                    args = ['Cannot access arguments: ' + e];
                }
                stack[stack.length] = fn + '(' + this.stringifyArguments(args) + ')';
                try {
                    curr = curr.caller;
                } catch (e) {
                    stack[stack.length] = 'Cannot access caller: ' + e;
                    break;
                }
            }
            return stack;
        },

        /**
         * Given arguments array as a String, substituting type names for non-string types.
         *
         * @param {Arguments,Array} args
         * @return {String} stringified arguments
         */
        stringifyArguments: function(args) {
            var result = [];
            var slice = Array.prototype.slice;
            for (var i = 0; i < args.length; ++i) {
                var arg = args[i];
                if (arg === undefined) {
                    result[i] = 'undefined';
                } else if (arg === null) {
                    result[i] = 'null';
                } else if (arg.constructor) {
                    // TODO constructor comparison does not work for iframes
                    if (arg.constructor === Array) {
                        if (arg.length < 3) {
                            result[i] = '[' + this.stringifyArguments(arg) + ']';
                        } else {
                            result[i] = '[' + this.stringifyArguments(slice.call(arg, 0, 1)) + '...' + this.stringifyArguments(slice.call(arg, -1)) + ']';
                        }
                    } else if (arg.constructor === Object) {
                        result[i] = '#object';
                    } else if (arg.constructor === Function) {
                        result[i] = '#function';
                    } else if (arg.constructor === String) {
                        result[i] = '"' + arg + '"';
                    } else if (arg.constructor === Number) {
                        result[i] = arg;
                    } else {
                        result[i] = '?';
                    }
                }
            }
            return result.join(',');
        },

        sourceCache: {},

        /**
         * @return {String} the text from a given URL
         */
        ajax: function(url) {
            var req = this.createXMLHTTPObject();
            if (req) {
                try {
                    req.open('GET', url, false);
                    //req.overrideMimeType('text/plain');
                    //req.overrideMimeType('text/javascript');
                    req.send(null);
                    //return req.status == 200 ? req.responseText : '';
                    return req.responseText;
                } catch (e) {
                }
            }
            return '';
        },

        /**
         * Try XHR methods in order and store XHR factory.
         *
         * @return {XMLHttpRequest} XHR function or equivalent
         */
        createXMLHTTPObject: function() {
            var xmlhttp, XMLHttpFactories = [
                function() {
                    return new XMLHttpRequest();
                }, function() {
                    return new ActiveXObject('Msxml2.XMLHTTP');
                }, function() {
                    return new ActiveXObject('Msxml3.XMLHTTP');
                }, function() {
                    return new ActiveXObject('Microsoft.XMLHTTP');
                }
            ];
            for (var i = 0; i < XMLHttpFactories.length; i++) {
                try {
                    xmlhttp = XMLHttpFactories[i]();
                    // Use memoization to cache the factory
                    this.createXMLHTTPObject = XMLHttpFactories[i];
                    return xmlhttp;
                } catch (e) {
                }
            }
        },

        /**
         * Given a URL, check if it is in the same domain (so we can get the source
         * via Ajax).
         *
         * @param url {String} source url
         * @return {Boolean} False if we need a cross-domain request
         */
        isSameDomain: function(url) {
            return typeof location !== "undefined" && url.indexOf(location.hostname) !== -1; // location may not be defined, e.g. when running from nodejs.
        },

        /**
         * Get source code from given URL if in the same domain.
         *
         * @param url {String} JS source URL
         * @return {Array} Array of source code lines
         */
        getSource: function(url) {
            // TODO reuse source from script tags?
            if (!(url in this.sourceCache)) {
                this.sourceCache[url] = this.ajax(url).split('\n');
            }
            return this.sourceCache[url];
        },

        guessAnonymousFunctions: function(stack) {
            for (var i = 0; i < stack.length; ++i) {
                var reStack = /\{anonymous\}\(.*\)@(.*)/,
                    reRef = /^(.*?)(?::(\d+))(?::(\d+))?(?: -- .+)?$/,
                    frame = stack[i], ref = reStack.exec(frame);

                if (ref) {
                    var m = reRef.exec(ref[1]);
                    if (m) { // If falsey, we did not get any file/line information
                        var file = m[1], lineno = m[2], charno = m[3] || 0;
                        if (file && this.isSameDomain(file) && lineno) {
                            var functionName = this.guessAnonymousFunction(file, lineno, charno);
                            stack[i] = frame.replace('{anonymous}', functionName);
                        }
                    }
                }
            }
            return stack;
        },

        guessAnonymousFunction: function(url, lineNo, charNo) {
            var ret;
            try {
                ret = this.findFunctionName(this.getSource(url), lineNo);
            } catch (e) {
                ret = 'getSource failed with url: ' + url + ', exception: ' + e.toString();
            }
            return ret;
        },

        findFunctionName: function(source, lineNo) {
            // FIXME findFunctionName fails for compressed source
            // (more than one function on the same line)
            // function {name}({args}) m[1]=name m[2]=args
            var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
            // {name} = function ({args}) TODO args capture
            // /['"]?([0-9A-Za-z_]+)['"]?\s*[:=]\s*function(?:[^(]*)/
            var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
            // {name} = eval()
            var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;
            // Walk backwards in the source lines until we find
            // the line which matches one of the patterns above
            var code = "", line, maxLines = Math.min(lineNo, 20), m, commentPos;
            for (var i = 0; i < maxLines; ++i) {
                // lineNo is 1-based, source[] is 0-based
                line = source[lineNo - i - 1];
                commentPos = line.indexOf('//');
                if (commentPos >= 0) {
                    line = line.substr(0, commentPos);
                }
                // TODO check other types of comments? Commented code may lead to false positive
                if (line) {
                    code = line + code;
                    m = reFunctionExpression.exec(code);
                    if (m && m[1]) {
                        return m[1];
                    }
                    m = reFunctionDeclaration.exec(code);
                    if (m && m[1]) {
                        //return m[1] + "(" + (m[2] || "") + ")";
                        return m[1];
                    }
                    m = reFunctionEvaluation.exec(code);
                    if (m && m[1]) {
                        return m[1];
                    }
                }
            }
            return '(?)';
        }
    };

    return printStackTrace;
}));
