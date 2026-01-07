// BCPL Interpreter (ported from icint.js)
// Adapted for Browser

const BCPL = (function() {

    // Constants
    const ASC_TAB = 8;
    const ASC_LF = 10;
    const ASC_FF = 12;
    const ASC_CR = 13;
    const ASC_SPACE = 32;
    const ASC_DOLLAR = 36;
    const ASC_PERCENT = 37;
    const ASC_PLUS = 43;
    const ASC_MINUS = 45;
    const ASC_SLASH = 47;

    const ASC_0 = 48;
    const ASC_9 = 57;
    const ASC_A = 65;
    const ASC_Z = 90;

    const ASC_L = 76;
    const ASC_S = 83;
    const ASC_J = 74;
    const ASC_T = 84;
    const ASC_F = 70;
    const ASC_K = 75;
    const ASC_X = 88;
    const ASC_C = 67;
    const ASC_D = 68;
    const ASC_G = 71;
    const ASC_I = 73;
    const ASC_P = 80;
    const ASC_O = 79;
    const ASC_N = 78;

    const STR_NO_INPUT = "NO INPUT";
    const STR_NO_OUTPUT = "NO OUTPUT";
    const STR_NO_ICFILE = "NO ICFILE";

    const PROGSTART = 401;
    const WORDCOUNT = 100000; // Increased memory
    const LABVCOUNT = 1000; // Increased label count just in case

    const FN_BITS = 8;
    const FN_MASK = 255;
    const F0_L = 0;
    const F1_S = 1;
    const F2_A = 2;
    const F3_J = 3;
    const F4_T = 4;
    const F5_F = 5;
    const F6_K = 6;
    const F7_X = 7;
    const FI_BIT = 1 << 3;
    const FP_BIT = 1 << 4;
    const FD_BIT = 1 << 5;

    // K-codes
    const K01_START = 1;
    const K02_SETPM = 2;
    const K03_ABORT = 3;
    const K04_BACKTRACE = 4;
    const K11_SELECTINPUT = 11;
    const K12_SELECTOUTPUT = 12;
    const K13_RDCH = 13;
    const K14_WRCH = 14;
    const K15_UNRDCH = 15;
    const K16_INPUT = 16;
    const K17_OUTPUT = 17;
    const K30_STOP = 30;
    const K31_LEVEL = 31;
    const K32_LONGJUMP = 32;
    const K34_BINWRCH = 34;
    const K35_REWIND = 35;
    const K40_APTOVEC = 40;
    const K41_FINDOUTPUT = 41;
    const K42_FINDINPUT = 42;
    const K46_ENDREAD = 46;
    const K47_ENDWRITE = 47;
    const K60_WRITES = 60;
    const K62_WRITEN = 62;
    const K63_NEWLINE = 63;
    const K64_NEWPAGE = 64;
    const K65_WRITEO = 65;
    const K66_PACKSTRING = 66;
    const K67_UNPACKSTRING = 67;
    const K68_WRITED = 68;
    const K69_WRITEARG = 69;
    const K70_READN = 70;
    const K71_TERMINATOR = 71;
    const K74_WRITEX = 74;
    const K75_WRITEHEX = 75;
    const K76_WRITEF = 76;
    const K77_WRITEOCT = 77;
    const K78_MAPSTORE = 78;
    const K85_GETBYTE = 85;
    const K86_PUTBYTE = 86;
    const K87_GETVEC = 87;
    const K88_FREEVEC = 88;
    const K89_RANDOM = 89;
    const K90_MULDIV = 90;
    const K91_RESULT2 = 91;

    const ENDSTREAMCH = -1;
    const BYTESPERWORD = 2;
    const strdigits = "0123456789ABCDEF";

    class Interpreter {
        constructor(files, onOutput, onFinish) {
            this.files = files; // { name: content }
            this.onOutput = onOutput || console.log;
            this.onFinish = onFinish || function() {};
            
            this.buffer = new ArrayBuffer(WORDCOUNT * BYTESPERWORD);
            this.m = new Int16Array(this.buffer);
            this.mu = new Uint16Array(this.buffer);
            this.lomem = 0;
            
            this.streams = []; // Array of { content: string, pos: number, mode: 'r'|'w' }
            this.cis = 0;
            this.cos = 0;
            this.sysin = 0;
            this.sysprint = 0;

            this.cp = 0;
            this.ch = 0;
            this.labv_offset = WORDCOUNT - LABVCOUNT;

            this.running = false;
            this.halted = false;
        }

        // File System / Streams
        openfile(fn, mode) {
            // Debug log
            if (this.sysprint && this.cos === this.sysprint) {
                 // Avoid recursion if log goes to sysprint
            } else {
                 // this.onOutput(`DEBUG: openfile ${fn} ${mode}\n`);
            }
            // Better: use console.warn for debug which goes to browser console, not interfering with BCPL IO
            // console.warn(`DEBUG: openfile '${fn}' '${mode}'`);

            if (fn.toUpperCase() === "SYSIN") return this.sysin;
            if (fn.toUpperCase() === "SYSPRINT") return this.sysprint;

            let fileContent = "";

            if (mode === 'r') {
                if (this.files.hasOwnProperty(fn)) {
                    fileContent = this.files[fn];
                    console.warn(`File found: ${fn}`);
                } else if (this.files.hasOwnProperty(fn.toLowerCase())) { 
                     fileContent = this.files[fn.toLowerCase()];
                     console.warn(`File found (lower): ${fn.toLowerCase()}`);
                } else if (this.files.hasOwnProperty(fn.toUpperCase())) { 
                     fileContent = this.files[fn.toUpperCase()];
                     console.warn(`File found (upper): ${fn.toUpperCase()}`);
                } else {
                    console.warn(`File NOT found: ${fn}`);
                    return 0; // Not found
                }
            } else {
                // 'w': create new "file" in memory
                this.files[fn] = "";
                console.warn(`File created: ${fn}`);
            }


            // Note: Streams in BCPL are identified by small integers.
            // We use the index in streams array + 1 (to avoid 0).
            const streamId = this.streams.length + 1;
            this.streams.push({
                content: fileContent,
                pos: 0,
                mode: mode,
                name: fn
            });
            return streamId;
        }

        rdch() {
            if (this.cis === 0 || this.cis > this.streams.length) return ENDSTREAMCH;
            const s = this.streams[this.cis - 1];
            if (s.mode !== 'r') return ENDSTREAMCH;

            if (s.pos >= s.content.length) return ENDSTREAMCH;
            const descriptor = s.content.charCodeAt(s.pos++);
            return descriptor === ASC_CR ? ASC_LF : descriptor;
        }

        wrch(c) {
            // Debug every write
            // console.log(`wrch(${c}) to ${this.cos}`);

            if (this.cos === 0 || this.cos > this.streams.length) return;
            const s = this.streams[this.cos - 1];
            
            let charStr = String.fromCharCode(c);
            if (c === ASC_LF) charStr = "\n"; 

            if (s.mode === 'w') {
                s.content += charStr;
                // If this is sysprint (or effectively sysprint), output to console
                if (this.cos === this.sysprint) {
                    this.onOutput(charStr);
                } else {
                     // Debug: write to file detected
                     // console.log(`Writing to file ${s.name}: ${c}`);
                }
                
                // Update file in files system if it's a named file
                if (s.name) {
                    this.files[s.name] = s.content;
                }
            } else {
                 console.warn(`Attempt to write to read-only stream ${this.cos} (${s.name})`);
            }
        }
        
        newline() {
            this.wrch(ASC_LF);
        }

        endread() {
            if (this.cis !== this.sysin) {
                // In C, close(cis). Here, just switch back.
                this.cis = this.sysin;
            }
        }

        endwrite() {
            if (this.cos !== this.sysprint) {
                this.cos = this.sysprint;
            }
        }

        // Memory Helpers
        cstr(s_ptr) {
             const memBytes = new Uint8Array(this.buffer);
             let byteIdx = s_ptr * 2;
             let len = memBytes[byteIdx];
             let str = "";
             for (let i = 0; i < len; i++) {
                 str += String.fromCharCode(memBytes[byteIdx + 1 + i]);
             }
             return str;
        }

        findinput(fn_bcpl) {
            let fn = (typeof fn_bcpl === 'number') ? this.cstr(fn_bcpl) : fn_bcpl;
            return this.openfile(fn, 'r');
        }

        findoutput(fn_bcpl) {
            let fn = (typeof fn_bcpl === 'number') ? this.cstr(fn_bcpl) : fn_bcpl;
            return this.openfile(fn, 'w');
        }

        // Assembler Methods
        stw(w) {
            this.m[this.lomem++] = w;
            this.cp = 0;
        }

        stc(c) {
            if (this.cp === 0) this.stw(0);
            const memBytes = new Uint8Array(this.buffer);
            let byteAddr = (this.lomem - 1) * 2 + this.cp;
            memBytes[byteAddr] = c;
            this.cp++;
            if (this.cp === BYTESPERWORD) this.cp = 0;
        }

        rch() {
            this.ch = this.rdch();
            while (this.ch === ASC_SLASH) {
                do {
                    this.ch = this.rdch();
                } while (this.ch !== ASC_LF && this.ch !== ENDSTREAMCH);
                while (this.ch === ASC_LF) this.ch = this.rdch();
            }
        }
        
        rdn() {
            let sum = 0;
            let neg = (this.ch === ASC_MINUS);
            if (neg) this.rch();
            while (this.ch >= ASC_0 && this.ch <= ASC_9) {
                sum = sum * 10 + (this.ch - ASC_0);
                this.rch();
            }
            return neg ? -sum : sum;
        }

        labref(n, a) {
            let k = this.m[this.labv_offset + n];
            if (k < 0) {
                k = -k; 
            } else {
                this.m[this.labv_offset + n] = a; 
            }
            this.m[a] += k;
        }
        
        halt(msg, n) {
            // this.cos = this.sysprint; // Force output to sysprint on halt?
            const str = "\\nHALT: " + msg + (n !== undefined ? " #" + n : "") + "\\n";
            for(let i=0; i<str.length; i++) {
                // Force direct output to onOutput just in case cos is broken
                this.onOutput(str[i]); 
            }
            this.running = false;
            this.halted = true;
        }

        assemble() {
            let n;
            for (let i = 0; i < LABVCOUNT; i++) this.m[this.labv_offset + i] = 0;
            this.cp = 0;
            this.rch();
            
            while (true) { 
                if (this.ch <= ASC_9 && this.ch >= ASC_0) {
                    n = this.rdn();
                    let k = this.m[this.labv_offset + n];
                    if (k < 0) this.halt("DUPLICATE LABEL", n);
                    while (k > 0) {
                        let tmp = this.m[k];
                        this.m[k] = this.lomem;
                        k = tmp;
                    }
                    this.m[this.labv_offset + n] = -this.lomem;
                    this.cp = 0;
                    continue; 
                }
                
                switch (this.ch) {
                    default:
                        if (this.ch !== ENDSTREAMCH) this.halt("BAD CH (" + String.fromCharCode(this.ch) + ")", this.ch);
                        return;
                    case ASC_DOLLAR:
                    case ASC_SPACE:
                    case ASC_LF:
                        this.rch(); continue;
                    case ASC_L: n = F0_L; break;
                    case ASC_S: n = F1_S; break;
                    case ASC_A: n = F2_A; break;
                    case ASC_J: n = F3_J; break;
                    case ASC_T: n = F4_T; break;
                    case ASC_F: n = F5_F; break;
                    case ASC_K: n = F6_K; break;
                    case ASC_X: n = F7_X; break;
                    
                    case ASC_C:
                        this.rch(); this.stc(this.rdn()); continue;
                    case ASC_D:
                        this.rch();
                        if (this.ch === ASC_L) {
                            this.rch(); this.stw(0); this.labref(this.rdn(), this.lomem - 1);
                        } else {
                            this.stw(this.rdn());
                        }
                        continue;
                    case ASC_G:
                        this.rch(); n = this.rdn();
                        if (this.ch === ASC_L) this.rch(); else this.halt("BAD CODE AT P", this.lomem);
                        this.m[n] = 0; this.labref(this.rdn(), n); continue;
                    case ASC_Z:
                         for (n = 0; n < LABVCOUNT; ++n) {
                            if (this.m[this.labv_offset + n] > 0) this.halt("UNSET LABEL", n);
                        }
                        for (let i = 0; i < LABVCOUNT; i++) this.m[this.labv_offset + i] = 0;
                        this.cp = 0;
                        this.rch(); continue;
                }

                if (this.ch === ASC_DOLLAR || this.ch === ASC_SPACE || this.ch === ASC_LF) {
                     this.rch(); continue;
                }
                
                this.rch();
                if (this.ch === ASC_I) { n |= FI_BIT; this.rch(); }
                if (this.ch === ASC_P) { n |= FP_BIT; this.rch(); }
                if (this.ch === ASC_G) { this.rch(); }
                
                if (this.ch === ASC_L) {
                    this.rch(); this.stw(n | FD_BIT); this.stw(0); this.labref(this.rdn(), this.lomem - 1);
                } else {
                    let d = this.rdn();
                    if ((d & FN_MASK) === d) {
                        this.stw(n | (d << FN_BITS));
                    } else {
                        this.stw(n | FD_BIT); this.stw(d);
                    }
                }
            }
        }

        loadcode(fn) {
            const f = this.findinput(fn);
            if (f) {
                this.cis = f;
                this.assemble();
                this.endread();
                // Debug: check memory usage
                console.warn(`Memory used after loading ${fn}: ${this.lomem}/${WORDCOUNT}`);
            }
            return f;
        }

        // Output helper functions
        writes(s_ptr) {
            const memBytes = new Uint8Array(this.buffer);
            let byteIdx = s_ptr * 2;
            let len = memBytes[byteIdx];
            for (let i = 0; i < len; i++) {
                this.wrch(memBytes[byteIdx + 1 + i]);
            }
        }
        writed(n, d) {
            let s = Math.abs(n).toString();
            if (n < 0) s = "-" + s;
            while (s.length < d) s = " " + s;
            for (let i = 0; i < s.length; i++) this.wrch(s.charCodeAt(i));
        }
        writen(n) { this.writed(n, 0); }
        readn() {
            let sum = 0, c;
            let neg = false;
            do { c = this.rdch(); } while (c === ASC_SPACE || c === ASC_LF || c === ASC_TAB);
            if (c === ASC_MINUS) { neg = true; c = this.rdch(); } 
            else if (c === ASC_PLUS) { c = this.rdch(); }
            while (c >= ASC_0 && c <= ASC_9) {
                sum = sum * 10 + (c - ASC_0);
                c = this.rdch();
            }
            this.m[K71_TERMINATOR] = c;
            return neg ? -sum : sum;
        }
        writeoct(n, d) {
            if (d > 1) this.writeoct(n >>> 3, d - 1);
            this.wrch(strdigits.charCodeAt(n & 7));
        }
        writehex(n, d) {
            if (d > 1) this.writehex(n >>> 4, d - 1);
            this.wrch(strdigits.charCodeAt(n & 15));
        }
        writef(v_ptr) {
            let fmt_ptr = this.m[v_ptr++];
            const memBytes = new Uint8Array(this.buffer);
            let byteIdx = fmt_ptr * 2;
            let len = memBytes[byteIdx];
            let ss = 1;
            while (ss <= len) {
                let c = memBytes[byteIdx + ss++];
                if (c !== ASC_PERCENT) {
                    this.wrch(c);
                } else {
                    c = memBytes[byteIdx + ss++];
                    switch (c) {
                        default: this.wrch(c); break;
                        case ASC_S: this.writes(this.m[v_ptr++]); break;
                        case ASC_C: this.wrch(this.m[v_ptr++]); break;
                        case ASC_O: this.writeoct(this.mu[v_ptr++], this.decval(memBytes[byteIdx + ss++])); break;
                        case ASC_X: this.writehex(this.mu[v_ptr++], this.decval(memBytes[byteIdx + ss++])); break;
                        case ASC_I: this.writed(this.m[v_ptr++], this.decval(memBytes[byteIdx + ss++])); break;
                        case ASC_N: this.writen(this.m[v_ptr++]); break;
                    }
                }
            }
        }
        decval(c) {
            if (c >= ASC_0 && c <= ASC_9) return c - ASC_0;
            if (c >= ASC_A && c <= ASC_Z) return c - ASC_A + 10;
            return 0;
        }
        packstring(v_ptr, s_ptr) {
            let len = this.m[v_ptr];
            let n = Math.floor(len / BYTESPERWORD);
            this.m[s_ptr + n] = 0;
            const memBytes = new Uint8Array(this.buffer);
            let byteDest = s_ptr * 2;
            for (let i = 0; i <= len; i++) {
                memBytes[byteDest + i] = this.m[v_ptr + i] & 0xFF;
            }
            return n;
        }
        unpackstring(s_ptr, v_ptr) {
            const memBytes = new Uint8Array(this.buffer);
            let byteSrc = s_ptr * 2;
            let len = memBytes[byteSrc];
            for (let i = 0; i <= len; i++) {
                this.m[v_ptr + i] = memBytes[byteSrc + i];
            }
        }

        // Main Interpreter Loop
        interpret() {
            let pc = PROGSTART;
            let sp = this.lomem;
            let a = 0;
            let b = 0;
            let w, d;
            let v_ptr;
            
            this.running = true;
            // Removed step limits for simplicity in this artifact
            while (this.running) {
                w = this.mu[pc++];
                if (w & FD_BIT) d = this.m[pc++]; else d = w >>> FN_BITS;
                if (w & FP_BIT) d += sp;
                if (w & FI_BIT) d = this.m[d];

                switch (w & F7_X) {
                    case F0_L: b = a; a = d; break;
                    case F1_S: this.m[d] = a; break;
                    case F2_A: a = (a + d) << 16 >> 16; break;
                    case F3_J: pc = d; break;
                    case F4_T: if (a !== 0) pc = d; break;
                    case F5_F: if (a === 0) pc = d; break;
                    case F6_K:
                            d += sp;
                        if (a < PROGSTART) {
                            v_ptr = d + 2;
                            switch (a) {
                                default: this.halt("UNKNOWN CALL", a); break;
                                case K01_START: break;
                                case K02_SETPM: 
                                    this.m[sp] = 0; this.m[sp + 1] = PROGSTART + 2;
                                    pc = a; break;
                                case K03_ABORT: break; 
                                case K04_BACKTRACE: break; 
                                case K11_SELECTINPUT: this.cis = this.m[v_ptr]; break;
                                case K12_SELECTOUTPUT: this.cos = this.m[v_ptr]; break;
                                case K13_RDCH: a = this.rdch(); break;
                                case K14_WRCH: this.wrch(this.m[v_ptr]); break;
                                case K16_INPUT: a = this.cis; break;
                                case K17_OUTPUT: a = this.cos; break;
                                case K30_STOP: this.running = false; return this.m[v_ptr];
                                case K31_LEVEL: a = sp; break;
                                case K32_LONGJUMP: sp = this.m[v_ptr]; pc = this.m[v_ptr + 1]; break;
                                case K40_APTOVEC:
                                    b = d + this.m[v_ptr + 1] + 1;
                                    this.m[b] = sp; this.m[b + 1] = pc; this.m[b + 2] = d; this.m[b + 3] = this.m[v_ptr + 1];
                                    sp = b; pc = this.m[v_ptr];
                                    break;
                                case K41_FINDOUTPUT: a = this.findoutput(this.m[v_ptr]); break;
                                case K42_FINDINPUT: a = this.findinput(this.m[v_ptr]); break;
                                case K46_ENDREAD: this.endread(); break;
                                case K47_ENDWRITE: this.endwrite(); break;
                                case K60_WRITES: this.writes(this.m[v_ptr]); break;
                                case K62_WRITEN: this.writen(this.m[v_ptr]); break;
                                case K63_NEWLINE: this.newline(); break;
                                case K64_NEWPAGE: this.wrch(ASC_FF); break;
                                case K66_PACKSTRING: a = this.packstring(this.m[v_ptr], this.m[v_ptr + 1]); break;
                                case K67_UNPACKSTRING: this.unpackstring(this.m[v_ptr], this.m[v_ptr + 1]); break;
                                case K68_WRITED: this.writed(this.m[v_ptr], this.m[v_ptr + 1]); break;
                                case K70_READN: a = this.readn(); break;
                                case K75_WRITEHEX: this.writehex(this.mu[v_ptr], this.m[v_ptr + 1]); break;
                                case K77_WRITEOCT: this.writeoct(this.mu[v_ptr], this.m[v_ptr + 1]); break;
                                case K76_WRITEF: this.writef(v_ptr); break;
                                case K85_GETBYTE: 
                                    {
                                        const memBytes = new Uint8Array(this.buffer);
                                        a = memBytes[this.m[v_ptr] * 2 + this.m[v_ptr + 1]];
                                    }
                                    break;
                                case K86_PUTBYTE:
                                    {
                                        const memBytes = new Uint8Array(this.buffer);
                                        memBytes[this.m[v_ptr] * 2 + this.m[v_ptr + 1]] = this.m[v_ptr + 2];
                                    }
                                    break;
                            }
                        } else {
                            this.m[d] = sp; this.m[d + 1] = pc; sp = d; pc = a;
                        }
                        break;
                        
                    case F7_X:
                        switch (d) {
                            default: this.halt("UNKNOWN EXEC", d); break;
                            case 1: a = this.m[a]; break;
                            case 2: a = (-a) << 16 >> 16; break;
                            case 3: a = (~a) << 16 >> 16; break;
                            case 4: pc = this.m[sp + 1]; sp = this.m[sp]; break;
                            case 5: a = Math.imul(b, a) << 16 >> 16; break;
                            case 6: if (a !== 0) a = Math.trunc(b / a) << 16 >> 16; break;
                            case 7: if (a !== 0) a = (b % a) << 16 >> 16; break;
                            case 8: a = (b + a) << 16 >> 16; break;
                            case 9: a = (b - a) << 16 >> 16; break;
                            case 10: a = -(b === a); break;
                            case 11: a = -(b !== a); break;
                            case 12: a = -(b < a); break;
                            case 13: a = -(b >= a); break;
                            case 14: a = -(b > a); break;
                            case 15: a = -(b <= a); break;
                            case 16: a = (b << a) << 16 >> 16; break;
                            case 17: a = ((b & 0xFFFF) >>> a) << 16 >> 16; break;
                            case 18: a = (b & a) << 16 >> 16; break;
                            case 19: a = (b | a) << 16 >> 16; break;
                            case 20: a = (b ^ a) << 16 >> 16; break;
                            case 21: a = (b ^ ~a) << 16 >> 16; break;
                            case 22: return 0;
                            case 23:
                                {
                                    let v_idx = pc;
                                    b = this.m[v_idx++];
                                    pc = this.m[v_idx++]; 
                                    
                                    while (b--) {
                                        if (a === this.m[v_idx]) {
                                            pc = this.m[v_idx + 1];
                                            break;
                                        }
                                        v_idx += 2;
                                    }
                                }
                                break;
                        }
                        break;
                }
            }
        }

        init() {
            for (this.lomem = 0; this.lomem < PROGSTART; ++this.lomem) this.m[this.lomem] = this.lomem;
            this.stw(F0_L | FI_BIT | (K01_START << FN_BITS));
            this.stw(F6_K | (2 << FN_BITS));
            this.stw(F7_X | (22 << FN_BITS));
            
            // Setup default streams
            // We need to map standard handles:
            // 1: SYSIN (stdin) -> Index 0
            // 2: SYSPRINT (stdout) -> Index 1
            this.streams = [];
            
            const sysinStream = {
                content: "", 
                pos: 0, 
                mode: 'r',
                name: "SYSIN"
            };
            this.streams.push(sysinStream);
            this.sysin = 1; // Handle 1 (Index 0)

            const sysprintStream = {
                content: "", 
                pos: 0, 
                mode: 'w',
                name: "SYSPRINT"
            };
            this.streams.push(sysprintStream);
            this.sysprint = 2; // Handle 2 (Index 1)

            this.cis = this.sysin;
            this.cos = this.sysprint;
        }
        
        pipeinput(fn) {
              // Instead of creating a new stream, let's load the file CONTENT into the default SYSIN stream (Handle 1)
              // This ensures that if the program resets to Handle 1 (SYSIN), it still sees the file.
              const f = this.findinput(fn); // Opens new stream at end
              if (!f) this.halt(STR_NO_INPUT, 0);

              // Hack: copy content to Stream 0 (Handle 1)
              const content = this.streams[f-1].content;
              this.streams[this.sysin - 1].content = content;
              this.streams[this.sysin - 1].pos = 0;
              this.streams[this.sysin - 1].mode = 'r';
              
              // Also keep cis pointing to sysin (Handle 1)
              this.cis = this.sysin;
              
              console.warn(`Piped ${fn} to SYSIN (Handle ${this.sysin})`);
        }

        pipeoutput(fn) {
              const f = this.openfile(fn, 'w');
              if (!f) this.halt(STR_NO_OUTPUT, 0);
              
              // Hijack Handle 2 (SYSPRINT) to point to this file's stream
              // This ensures that any code writing to Handle 2 writes to our file
              const fileStream = this.streams[f-1];
              this.streams[1] = fileStream; // Handle 2 is at index 1

              // Ensure safe default
              this.cos = 2; 

              console.warn(`Piped Output to ${fn} via Handle 2`);
        }

        run(args) {
            this.init();
            this.halted = false;
            
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                if (arg.startsWith('-')) {
                    if (arg.startsWith('-i')) {
                        this.pipeinput(arg.substring(2));
                    } else if (arg.startsWith('-o')) {
                        this.pipeoutput(arg.substring(2));
                    }
                } else {
                    if (!this.loadcode(arg)) this.halt("NO ICFILE " + arg, 0);
                }
            }
            
            if (!this.halted) { 
                this.interpret();
            }
            
            return this.files;
        }
    }

    return Interpreter;

})();
