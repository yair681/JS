require('dotenv').config(); 
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3000;

// --- הגדרות וחיבור למסד הנתונים ---
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

const mongoURI = process.env.MONGO_URI; 
if (!mongoURI) {
    console.error("FATAL ERROR: MONGO_URI is not defined in the environment.");
    process.exit(1);
}

mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB Connected Successfully!"))
    .catch(err => {
        console.log("Error connecting to MongoDB:", err);
        process.exit(1);
    });

// --- הגדרת מנהלי-על ---
const SUPER_ADMINS = [
    { password: 'prha12345', name: 'יאיר פריש' },
    { password: 'yair2589', name: 'יאיר פרץ' }
];

// --- הגדרת המבנה של כיתה ---
const classSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    createdAt: { type: Date, default: Date.now }
});

const Class = mongoose.model('Class', classSchema);

// --- הגדרת המבנה של תלמיד ---
const studentSchema = new mongoose.Schema({
    password: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    balance: { type: Number, default: 0 },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true }
});

const Student = mongoose.model('Student', studentSchema);

// --- הגדרת המבנה של מוצר בחנות ---
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: String,
    image: String,
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// --- הגדרת המבנה של קנייה ---
const purchaseSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    price: { type: Number, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
    createdAt: { type: Date, default: Date.now },
    approvedAt: Date
});

const Purchase = mongoose.model('Purchase', purchaseSchema);

// --- הגדרת המבנה של מורה ---
const teacherSchema = new mongoose.Schema({
    password: { type: String, required: true, unique: true },
    name: String,
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    createdAt: { type: Date, default: Date.now }
});

const Teacher = mongoose.model('Teacher', teacherSchema);

// --- פונקציה לאתחול ראשוני ---
async function initDB() {
    try {
        const classCount = await Class.countDocuments();
        if (classCount === 0) {
            console.log("Initializing Database with a default class...");
            const defaultClass = new Class({
                name: 'כיתה א',
                description: 'כיתה ראשונה'
            });
            await defaultClass.save();
            console.log("Default class created.");
        }
    } catch (error) {
        console.error("Error initializing database:", error);
    }
}

mongoose.connection.on('connected', () => {
    console.log("MongoDB connection established");
    initDB();
});

mongoose.connection.on('error', (err) => {
    console.error("MongoDB connection error:", err);
});

// --- נתיבים (Routes) ---

// 1. התחברות - זיהוי אוטומטי
app.post('/api/login', async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.json({ success: false, message: 'נא להזין סיסמה' });
        }

        // בדיקה אם זה מנהל-על
        const superAdmin = SUPER_ADMINS.find(admin => admin.password === password);
        if (superAdmin) {
            return res.json({ 
                success: true, 
                role: 'superadmin',
                name: superAdmin.name
            });
        }

        // בדיקה אם זה מורה
        const teacher = await Teacher.findOne({ password }).populate('classId');
        if (teacher) {
            return res.json({ 
                success: true, 
                role: 'teacher',
                name: teacher.name,
                classId: teacher.classId._id,
                className: teacher.classId.name
            });
        }

        // בדיקה אם זה תלמיד
        const student = await Student.findOne({ password }).populate('classId');
        if (student) {
            return res.json({ 
                success: true, 
                role: 'student',
                name: student.name,
                balance: student.balance,
                studentId: student._id,
                classId: student.classId._id,
                className: student.classId.name
            });
        }

        return res.json({ success: false, message: 'סיסמה שגויה' });
    } catch (error) {
        console.error("Login error:", error);
        res.json({ success: false, message: 'שגיאה בהתחברות' });
    }
});

// --- API לכיתות (רק למנהלי-על) ---

// 2. קבלת כל הכיתות
app.get('/api/classes', async (req, res) => {
    try {
        const classes = await Class.find({}).sort({ createdAt: -1 });
        res.json(classes);
    } catch (error) {
        console.error("Get classes error:", error);
        res.json([]);
    }
});

// 3. יצירת כיתה חדשה
app.post('/api/classes', async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name) {
            return res.json({ success: false, message: 'שם כיתה הוא שדה חובה' });
        }

        const newClass = new Class({
            name,
            description: description || ''
        });

        await newClass.save();
        res.json({ success: true, message: `הכיתה ${name} נוצרה בהצלחה`, class: newClass });
    } catch (error) {
        console.error("Create class error:", error);
        res.json({ success: false, message: 'שגיאה ביצירת כיתה' });
    }
});

// 4. מחיקת כיתה
app.delete('/api/classes/:id', async (req, res) => {
    try {
        const classId = req.params.id;
        
        // מחיקת כל התלמידים, מורים, מוצרים וקניות של הכיתה
        await Student.deleteMany({ classId });
        await Teacher.deleteMany({ classId });
        await Product.deleteMany({ classId });
        await Purchase.deleteMany({ classId });
        
        const deletedClass = await Class.findByIdAndDelete(classId);
        
        if (!deletedClass) {
            return res.json({ success: false, message: 'כיתה לא נמצאה' });
        }
        
        res.json({ success: true, message: `הכיתה ${deletedClass.name} נמחקה בהצלחה` });
    } catch (error) {
        console.error("Delete class error:", error);
        res.json({ success: false, message: 'שגיאה במחיקת הכיתה' });
    }
});

// 5. קבלת פרטי כיתה מסוימת
app.get('/api/classes/:id', async (req, res) => {
    try {
        const classInfo = await Class.findById(req.params.id);
        const students = await Student.find({ classId: req.params.id }).select('_id password name balance');
        const teachers = await Teacher.find({ classId: req.params.id }).select('_id password name');
        
        res.json({
            class: classInfo,
            students,
            teachers
        });
    } catch (error) {
        console.error("Get class details error:", error);
        res.json({ class: null, students: [], teachers: [] });
    }
});

// --- API לתלמידים ---

// 6. קבלת רשימת תלמידים (לפי כיתה)
app.get('/api/students', async (req, res) => {
    try {
        const { classId } = req.query;
        
        if (!classId) {
            return res.json([]);
        }
        
        const students = await Student.find({ classId }).select('_id password name balance').sort({ name: 1 });
        res.json(students);
    } catch (error) {
        console.error("Get students error:", error);
        res.json([]);
    }
});

// 7. עדכון יתרה
app.post('/api/update', async (req, res) => {
    try {
        const { studentId, amount } = req.body;
        
        if (!studentId || amount === undefined) {
            return res.json({ success: false, message: 'פרמטרים חסרים' });
        }
        
        const updatedStudent = await Student.findByIdAndUpdate(
            studentId,
            { $inc: { balance: parseInt(amount) } },
            { new: true }
        );

        if (updatedStudent) {
            res.json({ success: true, newBalance: updatedStudent.balance });
        } else {
            res.json({ success: false, message: 'תלמיד לא נמצא' });
        }
    } catch (error) {
        console.error("Update balance error:", error);
        res.json({ success: false, message: 'שגיאה בעדכון היתרה' });
    }
});

// 8. יצירת תלמיד
app.post('/api/create-student', async (req, res) => {
    try {
        const { password, name, balance, classId } = req.body;
        
        if (!password || !name || !classId) {
            return res.json({ success: false, message: 'סיסמה, שם וכיתה הן שדות חובה' });
        }
        
        const existingStudent = await Student.findOne({ password });
        if (existingStudent) {
            return res.json({ success: false, message: 'סיסמה זו כבר קיימת במערכת' });
        }

        const newStudent = new Student({
            password,
            name,
            balance: parseInt(balance) || 0,
            classId
        });

        await newStudent.save();
        res.json({ success: true, message: `התלמיד ${name} נוצר בהצלחה`, student: newStudent });
    } catch (error) {
        console.error("Create student error:", error);
        res.json({ success: false, message: 'שגיאה בשמירת תלמיד חדש' });
    }
});

// 9. מחיקת תלמיד
app.delete('/api/students/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        
        const deletedStudent = await Student.findByIdAndDelete(studentId);
        
        if (!deletedStudent) {
            return res.json({ success: false, message: 'תלמיד לא נמצא' });
        }
        
        await Purchase.deleteMany({ studentId });
        
        res.json({ success: true, message: `התלמיד ${deletedStudent.name} נמחק בהצלחה` });
    } catch (error) {
        console.error("Delete student error:", error);
        res.json({ success: false, message: 'שגיאה במחיקת התלמיד' });
    }
});

// 10. עדכון יתרה ידני (סכום מדויק)
app.post('/api/set-balance', async (req, res) => {
    try {
        const { studentId, balance } = req.body;
        
        if (!studentId || balance === undefined) {
            return res.json({ success: false, message: 'פרמטרים חסרים' });
        }
        
        const updatedStudent = await Student.findByIdAndUpdate(
            studentId,
            { balance: parseInt(balance) },
            { new: true }
        );

        if (updatedStudent) {
            res.json({ success: true, newBalance: updatedStudent.balance });
        } else {
            res.json({ success: false, message: 'תלמיד לא נמצא' });
        }
    } catch (error) {
        console.error("Set balance error:", error);
        res.json({ success: false, message: 'שגיאה בעדכון היתרה' });
    }
});

// 11. קבלת יתרה אישית (לתלמיד)
app.get('/api/my-balance/:studentId', async (req, res) => {
    try {
        const student = await Student.findById(req.params.studentId);
        if (student) {
            res.json({ balance: student.balance });
        } else {
            res.json({ balance: 0 });
        }
    } catch (error) {
        console.error("Get balance error:", error);
        res.json({ balance: 0 });
    }
});

// --- API למורים ---

// 12. יצירת מורה
app.post('/api/create-teacher', async (req, res) => {
    try {
        const { password, name, classId } = req.body;
        
        if (!password || !classId) {
            return res.json({ success: false, message: 'סיסמה וכיתה הן שדות חובה' });
        }

        const existingTeacher = await Teacher.findOne({ password });
        if (existingTeacher) {
            return res.json({ success: false, message: 'סיסמה זו כבר קיימת במערכת' });
        }
        
        // בדיקה שזו לא סיסמה של מנהל-על
        if (SUPER_ADMINS.some(admin => admin.password === password)) {
            return res.json({ success: false, message: 'לא ניתן להשתמש בסיסמה זו' });
        }

        const newTeacher = new Teacher({
            password,
            name: name || '',
            classId
        });

        await newTeacher.save();
        res.json({ 
            success: true, 
            message: `המורה ${name || ''} נוצר בהצלחה`,
            teacher: newTeacher
        });
    } catch (error) {
        console.error("Create teacher error:", error);
        res.json({ success: false, message: 'שגיאה ביצירת מורה חדש' });
    }
});

// 13. מחיקת מורה
app.delete('/api/teachers/:id', async (req, res) => {
    try {
        const teacherId = req.params.id;
        
        const deletedTeacher = await Teacher.findByIdAndDelete(teacherId);
        
        if (!deletedTeacher) {
            return res.json({ success: false, message: 'מורה לא נמצא' });
        }
        
        res.json({ success: true, message: `המורה ${deletedTeacher.name} נמחק בהצלחה` });
    } catch (error) {
        console.error("Delete teacher error:", error);
        res.json({ success: false, message: 'שגיאה במחיקת המורה' });
    }
});

// --- API לחנות ---

// 14. יצירת מוצר חדש (לפי כיתה)
app.post('/api/products', async (req, res) => {
    try {
        const { name, price, description, image, classId } = req.body;
        
        if (!name || !price || !classId) {
            return res.json({ success: false, message: 'שם, מחיר וכיתה הן שדות חובה' });
        }

        const newProduct = new Product({
            name,
            price: parseInt(price),
            description: description || '',
            image: image || null,
            classId
        });

        await newProduct.save();
        res.json({ success: true, message: `המוצר ${name} נוסף בהצלחה`, product: newProduct });
    } catch (error) {
        console.error("Create product error:", error);
        res.json({ success: false, message: 'שגיאה ביצירת מוצר' });
    }
});

// 15. קבלת כל המוצרים (לפי כיתה)
app.get('/api/products', async (req, res) => {
    try {
        const { classId } = req.query;
        
        if (!classId) {
            return res.json([]);
        }
        
        const products = await Product.find({ classId }).sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        console.error("Get products error:", error);
        res.json([]);
    }
});

// 16. מחיקת מוצר
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'המוצר נמחק בהצלחה' });
    } catch (error) {
        console.error("Delete product error:", error);
        res.json({ success: false, message: 'שגיאה במחיקת המוצר' });
    }
});

// 17. בקשת קנייה (תלמיד)
app.post('/api/purchase', async (req, res) => {
    try {
        const { studentId, productId } = req.body;
        
        if (!studentId || !productId) {
            return res.json({ success: false, message: 'פרמטרים חסרים' });
        }
        
        const student = await Student.findById(studentId);
        const product = await Product.findById(productId);
        
        if (!student) {
            return res.json({ success: false, message: 'תלמיד לא נמצא' });
        }
        
        if (!product) {
            return res.json({ success: false, message: 'מוצר לא נמצא' });
        }
        
        if (student.balance < product.price) {
            return res.json({ success: false, message: 'אין מספיק נקודות לרכישה' });
        }
        
        const newPurchase = new Purchase({
            studentId: student._id,
            studentName: student.name,
            productId: product._id,
            productName: product.name,
            price: product.price,
            classId: student.classId,
            status: 'pending'
        });
        
        await newPurchase.save();
        res.json({ success: true, message: 'הבקשה נשלחה למורה לאישור', purchase: newPurchase });
    } catch (error) {
        console.error("Purchase error:", error);
        res.json({ success: false, message: 'שגיאה ביצירת הקנייה' });
    }
});

// 18. קבלת כל הקניות (לפי כיתה)
app.get('/api/purchases', async (req, res) => {
    try {
        const { classId } = req.query;
        
        if (!classId) {
            return res.json([]);
        }
        
        const purchases = await Purchase.find({ classId }).sort({ createdAt: -1 });
        res.json(purchases);
    } catch (error) {
        console.error("Get purchases error:", error);
        res.json([]);
    }
});

// 19. קבלת קניות של תלמיד מסוים
app.get('/api/purchases/student/:studentId', async (req, res) => {
    try {
        const purchases = await Purchase.find({ studentId: req.params.studentId }).sort({ createdAt: -1 });
        res.json(purchases);
    } catch (error) {
        console.error("Get student purchases error:", error);
        res.json([]);
    }
});

// 20. אישור/דחיית קנייה (מורה)
app.post('/api/purchases/:id/approve', async (req, res) => {
    try {
        const { approve } = req.body;
        
        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) {
            return res.json({ success: false, message: 'קנייה לא נמצאה' });
        }
        
        if (purchase.status !== 'pending') {
            return res.json({ success: false, message: 'הקנייה כבר טופלה' });
        }
        
        if (approve) {
            const student = await Student.findById(purchase.studentId);
            if (!student) {
                return res.json({ success: false, message: 'תלמיד לא נמצא' });
            }
            
            if (student.balance < purchase.price) {
                return res.json({ success: false, message: 'לתלמיד אין מספיק נקודות' });
            }
            
            student.balance -= purchase.price;
            await student.save();
            
            purchase.status = 'approved';
            purchase.approvedAt = new Date();
            await purchase.save();
            
            res.json({ success: true, message: 'הקנייה אושרה והנקודות הורדו' });
        } else {
            purchase.status = 'rejected';
            await purchase.save();
            res.json({ success: true, message: 'הקנייה נדחתה' });
        }
    } catch (error) {
        console.error("Approve purchase error:", error);
        res.json({ success: false, message: 'שגיאה בעיבוד הקנייה' });
    }
});

// 21. מחיקת כל ההיסטוריה (לפי כיתה)
app.delete('/api/purchases', async (req, res) => {
    try {
        const { classId } = req.query;
        
        if (!classId) {
            return res.json({ success: false, message: 'נדרש מזהה כיתה' });
        }
        
        const result = await Purchase.deleteMany({ classId });
        res.json({ 
            success: true, 
            message: `נמחקו ${result.deletedCount} רשומות קנייה בהצלחה` 
        });
    } catch (error) {
        console.error("Delete all purchases error:", error);
        res.json({ success: false, message: 'שגיאה במחיקת ההיסטוריה' });
    }
});

// טיפול בשגיאות כלליות
app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Super Admins: ${SUPER_ADMINS.map(a => a.name).join(', ')}`);
});
